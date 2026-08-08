import { randomUUID } from "crypto";
import { runPipeline, rescoreWithRubric } from "./pipeline";
import { saveMatter } from "./store";
import { getEffectiveRubrics } from "./rubric-store";
import { addEvent } from "./events";
import { listMembers } from "./team";
import { isEmailConfigured, sendMatterReadyEmail } from "./email";
import {
  getUsage,
  consumeCreditIfOverCap,
  QuotaExceededError,
  DEFAULT_ACCOUNT_ID,
  type Account,
} from "./metering";
import type { Matter } from "./types";

const APP_URL = process.env.APP_URL ?? "https://briefly-psi-lake.vercel.app";

/**
 * Turn a raw submission into a saved, processed matter. Shared by the manual
 * submission form (src/app/actions.ts) and inbound email (src/app/api/inbound).
 * The caller resolves the owning `account` — by signed-in user for the form, by
 * inbound token for the webhook — so this stays session-agnostic. Null account
 * means metering/DB is disabled (local dev); ingestion is then unlimited.
 *
 * Metering: the owning account's monthly cap (+ credits) is enforced BEFORE the
 * pipeline runs, so an over-quota submission never spends model tokens. Throws
 * QuotaExceededError when blocked; a credit is consumed for over-cap extractions.
 *
 * For inbound email the envelope sender is authoritative, so `clientEmailHint`
 * takes priority for the email; the extracted name wins for the display name.
 */
export async function ingestSubmission(opts: {
  submission: string;
  account: Account | null;
  clientNameHint?: string | null;
  clientEmailHint?: string | null;
}): Promise<Matter> {
  const submission = opts.submission.trim();

  const account = opts.account;
  let usedBefore = 0;
  if (account) {
    const usage = await getUsage(account);
    if (usage.blocked) throw new QuotaExceededError();
    usedBefore = usage.used;
  }

  // Classify + extract against this firm's own rubrics (BYOR), or the built-in
  // set if they haven't authored any yet.
  const rubrics = await getEffectiveRubrics(account?.id ?? null);
  const result = await runPipeline(submission, rubrics);

  // Resolve the client identity, then make the result authoritative so the UI
  // (which reads `result`) and the drafted email agree with the matter record.
  const clientName = result.clientName ?? opts.clientNameHint ?? null;
  const clientEmail = opts.clientEmailHint ?? result.clientEmail ?? null;
  result.clientName = clientName;
  result.clientEmail = clientEmail;
  if (result.draftEmail && !result.draftEmail.to) {
    result.draftEmail.to = clientEmail;
  }

  const now = new Date().toISOString();
  const matter: Matter = {
    id: randomUUID(),
    createdAt: now,
    accountId: account?.id ?? DEFAULT_ACCOUNT_ID,
    clientName,
    clientEmail,
    submission,
    result,
    status: result.readiness >= 100 ? "ready_for_review" : "needs_info",
    approvedAt: null,
    assignedTo: null,
    updatedAt: now,
  };

  await saveMatter(matter);
  if (account) await consumeCreditIfOverCap(account, usedBefore);
  await addEvent(matter.accountId, matter.id, "created", `New matter · ${result.readiness}% ready`);
  return matter;
}

/**
 * Fold a client's reply into an EXISTING matter: append the message, re-score
 * against the matter's rubric (no re-classification), advance the status, and log
 * the lifecycle events. Replies aren't new matters — no metering — and never
 * downgrade an already-approved matter. Fires the "ready for review" nudge when a
 * reply completes the matter.
 */
export async function ingestReply(opts: {
  account: Account | null;
  matter: Matter;
  message: string;
}): Promise<Matter> {
  const { account, matter } = opts;
  const message = opts.message.trim();

  const prevReadiness = matter.result?.readiness ?? 0;
  const prevStatus = matter.status;
  const wasApproved = prevStatus === "approved";

  const rubrics = await getEffectiveRubrics(account?.id ?? matter.accountId);
  const rubric = rubrics.find((r) => r.id === matter.result?.rubricId) ?? rubrics[0];

  const combined = `${matter.submission}\n\n--- Client reply (${new Date()
    .toISOString()
    .slice(0, 10)}) ---\n${message}`;
  const result = await rescoreWithRubric(combined, rubric);

  // Keep the original client identity.
  result.clientName = matter.clientName ?? result.clientName;
  result.clientEmail = matter.clientEmail ?? result.clientEmail;
  if (result.draftEmail && !result.draftEmail.to) result.draftEmail.to = result.clientEmail;

  matter.submission = combined;
  matter.result = result;
  matter.updatedAt = new Date().toISOString();
  if (!wasApproved) {
    matter.status = result.readiness >= 100 ? "ready_for_review" : "needs_info";
  }

  await saveMatter(matter);

  const acct = account?.id ?? matter.accountId;
  await addEvent(acct, matter.id, "client_replied", "Client replied");
  if (result.readiness !== prevReadiness) {
    await addEvent(
      acct,
      matter.id,
      "readiness_changed",
      `Readiness ${prevReadiness}% → ${result.readiness}%`,
    );
  }

  const becameReady =
    !wasApproved && prevStatus !== "ready_for_review" && matter.status === "ready_for_review";
  if (becameReady) {
    await addEvent(
      acct,
      matter.id,
      "became_ready",
      "Everything required is now present — ready for review",
    );
    await notifyReady(account, matter);
  }

  return matter;
}

/** Email the assignee (or the firm owner) that a matter is ready for review. */
async function notifyReady(account: Account | null, matter: Matter): Promise<void> {
  if (!account || !isEmailConfigured()) return;
  try {
    const members = await listMembers(account.id);
    let to: string | null = null;
    if (matter.assignedTo) {
      to = members.find((m) => m.userId === matter.assignedTo)?.email ?? null;
    }
    if (!to) to = members.find((m) => m.role === "owner")?.email ?? null;
    if (!to) return;
    await sendMatterReadyEmail(
      to,
      account.name,
      matter.clientName,
      `${APP_URL}/matters/${matter.id}`,
    );
  } catch (err) {
    console.error("notifyReady failed:", err);
  }
}
