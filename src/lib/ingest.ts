import { randomUUID } from "crypto";
import { runPipeline } from "./pipeline";
import { saveMatter } from "./store";
import { getEffectiveRubrics } from "./rubric-store";
import {
  getUsage,
  consumeCreditIfOverCap,
  QuotaExceededError,
  DEFAULT_ACCOUNT_ID,
  type Account,
} from "./metering";
import type { Matter } from "./types";

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

  const matter: Matter = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    accountId: account?.id ?? DEFAULT_ACCOUNT_ID,
    clientName,
    clientEmail,
    submission,
    result,
    status: result.readiness >= 100 ? "ready_for_review" : "needs_info",
    approvedAt: null,
    assignedTo: null,
  };

  await saveMatter(matter);
  if (account) await consumeCreditIfOverCap(account, usedBefore);
  return matter;
}
