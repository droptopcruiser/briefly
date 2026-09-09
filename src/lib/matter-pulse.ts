/**
 * Matter Pulse — the "where was I?" answer when a solo barrister reopens a file.
 *
 * Pure and testable: it takes the current state of each workflow (as plain data) and
 * assembles a compact orientation — what's waiting for review, what changed since the
 * last look, the next one-to-three admin jobs, and a one-line state. It reads existing
 * prepared work; it prepares nothing new and gives no advice.
 */

export interface PulseInput {
  fileOpen: { exists: boolean; state: string } | null;
  disclosure: { exists: boolean; state: string; asks: number; packCount: number; fixtureless?: boolean } | null;
  correspondence: { exists: boolean; state: string; flags: number } | null;
  hearing: { exists: boolean; state: string; fixture: string | null; missingFolder: number } | null;
  /** Event summaries since the last review, newest first. */
  recentChanges: string[];
}

export interface PulseItem {
  label: string;
  /** Which workflow it belongs to — the UI links it to that panel. */
  workflow: "file_open" | "disclosure" | "correspondence" | "hearing";
}

export interface Pulse {
  awaitingReview: PulseItem[];
  nextJobs: string[];
  stateLine: string;
  changed: string[];
  /** True when there is genuinely nothing prepared yet. */
  empty: boolean;
}

const isDraft = (s: { exists: boolean; state: string } | null | undefined) => !!s?.exists && s.state === "draft";

export function buildPulse(input: PulseInput): Pulse {
  const awaitingReview: PulseItem[] = [];
  if (isDraft(input.fileOpen)) awaitingReview.push({ label: "File Open note", workflow: "file_open" });
  if (isDraft(input.disclosure)) {
    const n = input.disclosure!.asks;
    awaitingReview.push({ label: `Disclosure note${n ? ` · ${n} request${n === 1 ? "" : "s"}` : ""}`, workflow: "disclosure" });
  }
  if (isDraft(input.correspondence)) {
    const n = input.correspondence!.flags;
    awaitingReview.push({ label: `Correspondence draft${n ? ` · ${n} to check` : ""}`, workflow: "correspondence" });
  }
  if (isDraft(input.hearing)) {
    const n = input.hearing!.missingFolder;
    awaitingReview.push({ label: `Hearing folder${n ? ` · ${n} item${n === 1 ? "" : "s"} missing` : ""}`, workflow: "hearing" });
  }

  // Next jobs — the most time-critical first; at most three.
  const nextJobs: string[] = [];
  if (input.hearing?.exists && input.hearing.missingFolder > 0) {
    nextJobs.push(`Chase ${input.hearing.missingFolder} hearing-folder item${input.hearing.missingFolder === 1 ? "" : "s"} before ${input.hearing.fixture || "the fixture"}.`);
  }
  if (input.disclosure?.exists && input.disclosure.asks > 0) {
    nextJobs.push(`Review ${input.disclosure.asks} disclosure request${input.disclosure.asks === 1 ? "" : "s"} to send.`);
  }
  if (input.correspondence?.exists && input.correspondence.flags > 0) {
    nextJobs.push(`Clear ${input.correspondence.flags} pre-send flag${input.correspondence.flags === 1 ? "" : "s"} before sending.`);
  }
  if (nextJobs.length < 3 && isDraft(input.fileOpen)) nextJobs.push("Review the File Open note.");
  const cappedJobs = nextJobs.slice(0, 3);

  // One-line state.
  const parts: string[] = [];
  if (input.disclosure?.exists) parts.push(`${input.disclosure.packCount} disclosure pack${input.disclosure.packCount === 1 ? "" : "s"}`);
  if (input.disclosure?.exists && input.disclosure.asks > 0) parts.push(`${input.disclosure.asks} request${input.disclosure.asks === 1 ? "" : "s"} open`);
  if (input.hearing?.exists && input.hearing.fixture) parts.push(`hearing ${input.hearing.fixture}`);
  const stateLine = parts.join(" · ") || "No prepared work yet.";

  const empty = !input.fileOpen?.exists && !input.disclosure?.exists && !input.correspondence?.exists && !input.hearing?.exists;

  return { awaitingReview, nextJobs: cappedJobs, stateLine, changed: input.recentChanges.slice(0, 5), empty };
}
