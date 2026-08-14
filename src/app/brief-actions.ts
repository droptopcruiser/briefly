"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getMatter, saveMatter } from "@/lib/store";
import { getCurrentAccount, DEFAULT_ACCOUNT_ID } from "@/lib/metering";
import { getEffectiveRubrics } from "@/lib/rubric-store";
import { addEvent } from "@/lib/events";
import { recordReview } from "@/lib/reviews";
import {
  getActiveBrief,
  createBriefForMatter,
  completeJudgmentForBrief,
  approveBrief,
} from "@/lib/work-brief";

/**
 * Actions for the Initial Work Brief — the bridge from a ready intake to
 * review-ready professional work. The human gate is absolute: approving a brief
 * is an INTERNAL step (it progresses the matter to "in progress"); it never
 * sends an external message. Any client communication keeps its own review-and-
 * send flow.
 */

async function loadMatterAndRubric(id: string) {
  const account = await getCurrentAccount();
  const accountId = account?.id ?? DEFAULT_ACCOUNT_ID;
  const matter = await getMatter(id, accountId);
  if (!matter?.result) return { account, matter: null, rubric: undefined };
  const rubrics = await getEffectiveRubrics(matter.accountId);
  const rubric = rubrics.find((r) => r.id === matter.result!.rubricId);
  return { account, matter, rubric };
}

/**
 * Approve the current Initial Work Brief. Records the approved artifact version,
 * approver, and timestamp, and progresses the matter to "in progress". Sends
 * nothing.
 */
export async function approveWorkBrief(formData: FormData): Promise<void> {
  const t0 = Date.now();
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { matter } = await loadMatterAndRubric(id);
  if (!matter) return;

  const brief = await getActiveBrief(matter.id);
  if (!brief || brief.state === "approved") return;

  // A fast, model-free mutation: validate → persist approved state + audit →
  // progress the matter. NO model call and no regeneration — the UI only offers
  // Approve once the judgment is already complete (the footer shows "Finishing…"
  // while pending), so the approved version is always whole. The client updates
  // optimistically; this reconciles in the background.
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
  // Approving is a genuine review — set the baseline so later client activity
  // surfaces as "since the last review".
  await recordReview(matter, user.id);
  console.log(`[approve-timing] approveWorkBrief ms=${Date.now() - t0}`);
  revalidatePath(`/matters/${id}`);
  revalidatePath("/app");
}

/**
 * Refresh the brief: supersede the current version (preserving its reviewed/
 * approved history) and generate a new one from the latest matter state. Used
 * when the professional explicitly asks for a fresh draft — e.g. after a client
 * reply flagged the brief as stale. If the matter had been progressed, it returns
 * to "ready_for_you" so the refreshed brief is reviewed before work continues.
 */
export async function refreshWorkBrief(formData: FormData): Promise<void> {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { matter, rubric } = await loadMatterAndRubric(id);
  if (!matter) return;

  const brief = await createBriefForMatter(matter, rubric, { supersede: true });
  if (!brief) return;

  if (matter.status === "in_progress" || matter.status === "completed") {
    matter.status = "ready_for_you";
    matter.updatedAt = new Date().toISOString();
    await saveMatter(matter);
  }
  await addEvent(
    matter.accountId,
    matter.id,
    "brief_refreshed",
    `Initial Work Brief refreshed (v${brief.version})`,
  );
  revalidatePath(`/matters/${id}`);
  revalidatePath("/app");
}

/**
 * Generate the first brief on demand — a retry for when auto-generation on the
 * ready transition didn't leave one (e.g. a transient model error). No-op if a
 * live brief already exists, so it stays idempotent.
 */
export async function generateWorkBrief(formData: FormData): Promise<void> {
  const t0 = Date.now();
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { matter, rubric } = await loadMatterAndRubric(id);
  if (!matter) return;

  const existing = await getActiveBrief(matter.id);
  if (existing) return;

  const brief = await createBriefForMatter(matter, rubric);
  if (brief) {
    await addEvent(matter.accountId, matter.id, "brief_created", "Initial Work Brief prepared for review");
  }
  console.log(`[brief-timing] generateWorkBrief (facts-only, phase 1) ms=${Date.now() - t0}`);
  revalidatePath(`/matters/${id}`);
}

/**
 * Second phase of on-demand preparation: fill the model-written judgment sections
 * of the current brief. The card auto-triggers this the moment it renders a
 * facts-only brief, so the useful facts show immediately and the judgment fills
 * in behind them. Idempotent — a no-op once the judgment is present.
 */
export async function completeBriefJudgment(formData: FormData): Promise<void> {
  const t0 = Date.now();
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { matter, rubric } = await loadMatterAndRubric(id);
  if (!matter) return;

  await completeJudgmentForBrief(matter, rubric);
  console.log(`[brief-timing] completeBriefJudgment (judgment, phase 2) ms=${Date.now() - t0}`);
  revalidatePath(`/matters/${id}`);
}
