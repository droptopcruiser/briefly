import { randomUUID } from "crypto";
import { runPipeline } from "./pipeline";
import { saveMatter } from "./store";
import type { Matter } from "./types";

/**
 * Turn a raw submission into a saved, processed matter. Shared by the manual
 * submission form (src/app/actions.ts) and inbound email (src/app/api/inbound).
 *
 * For inbound email the envelope sender is authoritative, so `clientEmailHint`
 * takes priority for the email; the extracted name wins for the display name
 * (clients usually state it in the body), with the envelope name as fallback.
 */
export async function ingestSubmission(opts: {
  submission: string;
  clientNameHint?: string | null;
  clientEmailHint?: string | null;
}): Promise<Matter> {
  const submission = opts.submission.trim();
  const result = await runPipeline(submission);

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
    clientName,
    clientEmail,
    submission,
    result,
    status: result.readiness >= 100 ? "ready_for_review" : "needs_info",
    approvedAt: null,
  };

  await saveMatter(matter);
  return matter;
}
