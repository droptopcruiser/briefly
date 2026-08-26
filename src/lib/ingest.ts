import { randomUUID } from "crypto";
import { runPipeline, rescoreWithRubric } from "./pipeline";
import { saveMatter } from "./store";
import { getEffectiveRubrics } from "./rubric-store";
import { computeGaps, computeReadiness } from "./gaps";
import { addEvent } from "./events";
import { ensureBriefOnReady, getActiveBrief, isBriefStale } from "./work-brief";
import { recordReview } from "./reviews";
import { listMembers } from "./team";
import { upsertClient, getKnownFacts } from "./clients";
import { isEmailConfigured, sendMatterReadyEmail } from "./email";
import {
  getUsage,
  consumeCreditIfOverCap,
  QuotaExceededError,
  DEFAULT_ACCOUNT_ID,
  type Account,
} from "./metering";
import type { Matter, PipelineResult, Rubric } from "./types";

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

  // Carry forward known facts from this client's prior matters (never documents).
  const rubric = rubrics.find((r) => r.id === result.rubricId);
  await applyClientMemory(account?.id ?? null, clientEmail, result, rubric);

  const now = new Date().toISOString();
  const matter: Matter = {
    id: randomUUID(),
    createdAt: now,
    accountId: account?.id ?? DEFAULT_ACCOUNT_ID,
    clientName,
    clientEmail,
    submission,
    result,
    status: result.readiness >= 100 ? "ready_for_you" : "ready_for_review",
    approvedAt: null,
    assignedTo: null,
    updatedAt: now,
    lastNudgedAt: null,
    nudgeCount: 0,
    consultationAt: null,
  };

  await saveMatter(matter);
  if (account) await consumeCreditIfOverCap(account, usedBefore);
  await addEvent(matter.accountId, matter.id, "created", `New matter · ${result.readiness}% ready`);
  await upsertClient(matter.accountId, clientEmail, clientName);

  // Born ready (nothing missing) → prepare the Initial Work Brief straight away,
  // so intake that arrives complete lands as review-ready work, not a dead end.
  if (matter.status === "ready_for_you") {
    const brief = await ensureBriefOnReady(matter, rubric);
    if (brief) {
      await addEvent(matter.accountId, matter.id, "brief_created", "Initial Work Brief prepared for review");
    }
    // Baseline the prepared state so a later change is diffable (see ingestReply).
    await recordReview(matter, null);
  }
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
  const wasFinal = prevStatus === "completed";

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

  // Carry forward known facts (excluding this matter itself).
  await applyClientMemory(
    account?.id ?? matter.accountId,
    matter.clientEmail,
    result,
    rubric,
    matter.id,
  );

  matter.submission = combined;
  matter.result = result;
  matter.updatedAt = new Date().toISOString();
  // The client engaged — clear any pending "stuck" nudge.
  matter.lastNudgedAt = null;
  if (!wasFinal) {
    // Complete → the human's turn (ready_for_you); still gaps → a fresh follow-up
    // for the human to review & send (ready_for_review).
    matter.status = result.readiness >= 100 ? "ready_for_you" : "ready_for_review";
  }

  await saveMatter(matter);
  await upsertClient(matter.accountId, matter.clientEmail, matter.clientName);

  const acct = account?.id ?? matter.accountId;
  // One line per reply — the readiness move rides along, instead of a redundant
  // "Client replied" then "Readiness x → y" pair stacking up over a negotiation.
  const delta =
    result.readiness !== prevReadiness ? ` · ${prevReadiness}% → ${result.readiness}%` : "";
  await addEvent(acct, matter.id, "client_replied", `Client replied${delta}`);

  const becameReady =
    !wasFinal && prevStatus !== "ready_for_you" && matter.status === "ready_for_you";
  if (becameReady) {
    await addEvent(
      acct,
      matter.id,
      "became_ready",
      "Everything required is now present — ready for review",
    );
    // Readiness is a trigger, not a finish line: prepare the Initial Work Brief.
    const brief = await ensureBriefOnReady(matter, rubric);
    if (brief) {
      await addEvent(acct, matter.id, "brief_created", "Initial Work Brief prepared for review");
    }
    // Baseline the just-prepared state so any later change (a renegotiated price,
    // a moved settlement date) is shown as a diff — not silently absorbed.
    await recordReview(matter, null);
    await notifyReady(account, matter);
  } else {
    // Already ready with a live brief? The new reply may have made it stale —
    // flag it so the professional can refresh without losing the reviewed one.
    const active = await getActiveBrief(matter.id);
    if (active && isBriefStale(active, matter)) {
      await addEvent(acct, matter.id, "brief_stale", "New information arrived — brief may need a refresh");
    }
  }

  return matter;
}

/**
 * Carry forward known FACTS (never documents) from the client's prior matters:
 * fill only fields the current enquiry left empty — current evidence always wins
 * and is never overridden — then mark them carried + sourced to the origin matter
 * and recompute gaps/readiness.
 */
async function applyClientMemory(
  accountId: string | null,
  clientEmail: string | null,
  result: PipelineResult,
  rubric: Rubric | undefined,
  excludeMatterId?: string,
): Promise<void> {
  if (!accountId || !clientEmail || !rubric) return;
  const known = await getKnownFacts(accountId, clientEmail, excludeMatterId);
  if (known.length === 0) return;

  const byKey = new Map(known.map((k) => [k.key, k]));
  let changed = false;
  for (const f of result.fields) {
    if (f.present) continue; // current evidence wins — never override a stated fact
    const k = byKey.get(f.key);
    if (!k) continue;
    f.value = k.value;
    f.present = true;
    f.carried = true;
    f.source = `On file from previous matter · ${k.originMatterName} · ${k.date}`;
    changed = true;
  }
  if (changed) {
    result.gaps = computeGaps(rubric, result.fields, result.documentsPresent);
    result.readiness = computeReadiness(rubric, result.gaps);
  }
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
