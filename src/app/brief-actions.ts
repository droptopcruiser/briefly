"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getMatter, saveMatter } from "@/lib/store";
import { getCurrentAccount, DEFAULT_ACCOUNT_ID, INBOUND_DOMAIN } from "@/lib/metering";
import { getEffectiveRubrics } from "@/lib/rubric-store";
import { addEvent } from "@/lib/events";
import { recordReview } from "@/lib/reviews";
import { isEmailConfigured, sendEmail, senderFrom, composeEmailBody } from "@/lib/email";
import type { SendResult } from "@/app/actions";
import {
  getActiveBrief,
  createBriefForMatter,
  completeJudgmentForBrief,
  approveBrief,
  type WorkBrief,
} from "@/lib/work-brief";

/**
 * Actions for the Initial Work Brief — the bridge from a ready intake to
 * review-ready professional work.
 *
 * Performance model: these actions RETURN the artifact (or {ok}) so the client
 * renders it immediately — they do NOT call revalidatePath in the hot path, which
 * would force a full matter-page re-render (8+ DB queries) that the browser waits
 * on before showing anything. The client updates optimistically from the returned
 * data and calls router.refresh() to reconcile the rest of the page in the
 * background. The human gate is unchanged: approving is an INTERNAL step (matter
 * → in progress); nothing is ever sent.
 */

async function loadMatterAndRubric(id: string) {
  const account = await getCurrentAccount();
  const accountId = account?.id ?? DEFAULT_ACCOUNT_ID;
  // matter and rubrics both key off the account id → fetch them in parallel
  // instead of waterfalling.
  const [matter, rubrics] = await Promise.all([
    getMatter(id, accountId),
    getEffectiveRubrics(accountId),
  ]);
  if (!matter?.result) return { account, matter: null, rubric: undefined };
  const rubric = rubrics.find((r) => r.id === matter.result!.rubricId);
  return { account, matter, rubric };
}

/**
 * Phase 1 — prepare the deterministic, source-backed brief and RETURN it. No
 * model call, no revalidation: the facts come straight back so the client renders
 * them in ~1s. Idempotent: returns the existing live brief if there is one.
 */
export async function prepareBrief(matterId: string): Promise<WorkBrief | null> {
  const t0 = Date.now();
  await requireUser();
  // The existing-brief check doesn't depend on the matter load — run both together.
  const [{ matter, rubric }, existing] = await Promise.all([
    loadMatterAndRubric(matterId),
    getActiveBrief(matterId),
  ]);
  if (!matter) return null;

  let brief = existing;
  if (!brief) {
    brief = await createBriefForMatter(matter, rubric); // facts-only (fast)
    if (brief) {
      await addEvent(matter.accountId, matter.id, "brief_created", "Initial Work Brief prepared for review");
    }
  }
  console.log(`[brief-timing] prepareBrief (phase 1, facts) ms=${Date.now() - t0}`);
  return brief;
}

/**
 * Phase 2 — fill the model-written judgment sections and RETURN the updated
 * brief. Triggered by the client the moment the facts render, so the judgment
 * streams in behind the useful content. Idempotent (no-op once filled).
 */
export async function completeJudgment(matterId: string): Promise<WorkBrief | null> {
  const t0 = Date.now();
  await requireUser();
  const { matter, rubric } = await loadMatterAndRubric(matterId);
  if (!matter) return null;
  const brief = await completeJudgmentForBrief(matter, rubric);
  console.log(`[brief-timing] completeJudgment (phase 2, model) ms=${Date.now() - t0}`);
  return brief;
}

/**
 * Refresh — supersede the current brief and RETURN a fresh facts-only version
 * (judgment fills in via completeJudgment, same as prepare). Preserves prior
 * versions. If the matter had progressed, it returns to ready_for_you.
 */
export async function refreshBrief(matterId: string): Promise<WorkBrief | null> {
  const t0 = Date.now();
  await requireUser();
  const { matter, rubric } = await loadMatterAndRubric(matterId);
  if (!matter) return null;

  const brief = await createBriefForMatter(matter, rubric, { supersede: true });
  if (brief) {
    if (matter.status === "in_progress" || matter.status === "completed") {
      matter.status = "ready_for_you";
      matter.updatedAt = new Date().toISOString();
      await saveMatter(matter);
    }
    await addEvent(matter.accountId, matter.id, "brief_refreshed", `Initial Work Brief refreshed (v${brief.version})`);
  }
  console.log(`[brief-timing] refreshBrief ms=${Date.now() - t0}`);
  return brief;
}

/**
 * Approve — a fast, model-free mutation: validate → persist approved state +
 * audit event → progress the matter → record the review baseline. No model, no
 * regeneration, no revalidation. The client already flipped to "approved"
 * optimistically; it reconciles the rest of the page with router.refresh().
 */
export async function approveBrief_(matterId: string): Promise<{ ok: boolean }> {
  const t0 = Date.now();
  const user = await requireUser();
  const { matter } = await loadMatterAndRubric(matterId);
  if (!matter) return { ok: false };

  const brief = await getActiveBrief(matter.id);
  if (!brief) return { ok: false };
  if (brief.state === "approved") return { ok: true };

  await approveBrief(brief, user.id);
  matter.status = "in_progress";
  matter.updatedAt = new Date().toISOString();
  await saveMatter(matter);
  await addEvent(
    matter.accountId,
    matter.id,
    "brief_approved",
    `Initial Work Brief v${brief.version} approved — matter in progress`,
  );
  await recordReview(matter, user.id);
  console.log(`[approve-timing] approveBrief ms=${Date.now() - t0}`);
  return { ok: true };
}

/**
 * Send the brief's suggested client message (or the professional's edit of it) to
 * the client. The human gate is the "Approve & send" click — Briefly never sends
 * it automatically. Unlike a missing-info follow-up this does NOT move the matter
 * to awaiting_client (it's an informational note on a ready matter); Reply-To
 * still threads any client reply back into this same matter. Shaped for
 * useActionState.
 */
export async function sendBriefMessage(_prev: SendResult, formData: FormData): Promise<SendResult> {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!id || !body) return { ok: false, error: "Nothing to send." };

  const { account, matter } = await loadMatterAndRubric(id);
  if (!matter) return { ok: false, error: "Matter not found." };
  const to = matter.clientEmail;
  if (!to) {
    return { ok: false, error: "No client email on this matter — send it from your own mail client." };
  }
  if (!isEmailConfigured()) {
    return { ok: false, error: "Email sending isn't configured yet (POSTMARK_SERVER_TOKEN / MAIL_FROM)." };
  }

  const from = senderFrom(account?.name);
  const replyTo =
    account?.replyToMode === "firm"
      ? account.replyToEmail?.trim() || undefined
      : account?.inboundToken
        ? `${account.inboundToken}+${matter.id}@${INBOUND_DOMAIN}`
        : undefined;
  const finalBody = composeEmailBody(body, { signature: account?.emailSignature, firmName: account?.name });

  // Thread into the client's existing conversation via In-Reply-To / References
  // (see approveAndSendMatter). Subject is WYSIWYG — its default is the "Re:" thread
  // subject — so we send exactly what the professional saw.
  const thread = matter.result?.emailThread ?? null;

  try {
    await sendEmail({
      to,
      subject: subject || "Regarding your enquiry",
      body: finalBody,
      from,
      replyTo,
      inReplyTo: thread?.messageId ?? undefined,
      references: thread?.references ?? undefined,
    });
  } catch (err) {
    return { ok: false, error: `Send failed: ${err instanceof Error ? err.message : "unknown error"}` };
  }
  await addEvent(matter.accountId, matter.id, "sent", `Message sent to ${to}`);
  revalidatePath(`/matters/${id}`);
  return { ok: true };
}

/** Mark an in-progress matter complete — fast state mutation, returns {ok}. */
export async function completeMatter(matterId: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const { matter } = await loadMatterAndRubric(matterId);
  if (!matter) return { ok: false };
  matter.status = "completed";
  matter.approvedAt = new Date().toISOString();
  matter.updatedAt = matter.approvedAt;
  await saveMatter(matter);
  await addEvent(matter.accountId, matter.id, "completed", "Matter marked complete");
  await recordReview(matter, user.id);
  return { ok: true };
}
