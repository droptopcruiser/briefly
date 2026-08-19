import type { Matter, Rubric } from "./types";

/** Stable id shared by a fact (in the evidence drawer) and a factor's source that
 *  points at it, so the workspace and the drawer can highlight the same thing. */
export function factSlug(label: string): string {
  return (label ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** First sentence of a summary, capped — the "what's happening now" line. */
export function firstSentence(text: string): string {
  const t = (text ?? "").trim();
  const m = t.match(/^(.*?[.!?])(\s|$)/);
  const s = (m ? m[1] : t).trim();
  return s.length > 200 ? s.slice(0, 197) + "…" : s;
}

/**
 * A workflow status derived from the rulebook's intended next action, not a flat
 * "100% ready" — what the professional should DO, in their own terms. Shared by the
 * matter page's "Now" and the matters list, so a matter reads the same everywhere.
 *
 * `planReady` (the consultation plan is prepared AND marked ready) is what makes a
 * matter "ready for the consultation" — not merely that a date exists. The list
 * doesn't load packets, so it passes false and shows the pre-consultation status.
 */
export function workflowStatus(matter: Matter, rubric: Rubric | undefined, planReady = false): string {
  const intent = rubric?.nextActionIntent?.trim();
  switch (matter.status) {
    case "ready_for_review": {
      const n = matter.result?.gaps.length ?? 0;
      return n <= 1 ? "Waiting on one client detail" : `Waiting on ${n} client details`;
    }
    case "awaiting_client":
      return matter.lastNudgedAt ? "Follow-up ready to send" : "Waiting on the client";
    case "ready_for_you":
      if (planReady) return "Ready for the consultation";
      return "Ready for your review";
    case "in_progress":
      if (planReady) return "Ready for the consultation";
      return intent ? `In progress — ${intent}` : "In progress";
    case "completed":
      return "Completed";
    default:
      return "In progress";
  }
}

/** Tone class for a workflow status — action-forward, not a progress colour. */
export function statusTone(matter: Matter): "accent" | "awaiting" | "muted" {
  switch (matter.status) {
    case "ready_for_review":
      return "awaiting";
    case "awaiting_client":
      return "muted";
    case "ready_for_you":
    case "in_progress":
      return "accent";
    case "completed":
      return "muted";
    default:
      return "muted";
  }
}
