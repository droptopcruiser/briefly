/**
 * Counsel Review Pack — a concise, source-backed ORIENTATION assembled before court
 * or a call, so counsel has one reliable snapshot instead of another long summary.
 *
 * Pure and testable. It reads existing prepared work and the matter's facts and lays
 * them out: identity, charge/SOF status, the latest fixture/minute, the latest
 * disclosure, unresolved gaps, prepared drafts, and what changed. It is explicitly an
 * orientation pack — NOT case theory, legal advice, or submissions — and it invents
 * nothing (an absent fact stays a bracketed gap).
 */

export const REVIEW_PACK_VERSION = "review-pack/1";

export interface PackItem {
  label: string;
  value: string | null;
  source?: string | null;
}

export interface ReviewPackInput {
  defendant: PackItem;
  charge: PackItem;
  court: PackItem;
  prn: PackItem;
  chargeDocPresent: boolean;
  sofPresent: boolean;
  fixtureLine: string | null;
  hearingTypeLabel: string | null;
  directions: string[];
  latestPackLine: string | null;
  deliverySource: string | null;
  disclosureAsks: string[];
  unresolvedGaps: string[];
  preparedDrafts: { label: string; state: string }[];
  changed: string[];
}

export interface ReviewPack {
  workflowVersion: string;
  identity: PackItem[];
  chargeStatus: string;
  fixture: string;
  hearingTypeLabel: string | null;
  directions: string[];
  disclosure: string;
  disclosureAsks: string[];
  unresolvedGaps: string[];
  preparedDrafts: { label: string; state: string }[];
  changed: string[];
  disclaimer: string;
}

export function buildReviewPack(input: ReviewPackInput): ReviewPack {
  const check = (b: boolean) => (b ? "✓" : "○");
  return {
    workflowVersion: REVIEW_PACK_VERSION,
    identity: [input.defendant, input.charge, input.court, input.prn],
    chargeStatus: `${check(input.chargeDocPresent)} Charging document   ${check(input.sofPresent)} Summary of Facts`,
    fixture: input.fixtureLine ?? "No fixture recorded yet.",
    hearingTypeLabel: input.hearingTypeLabel,
    directions: input.directions,
    disclosure: input.latestPackLine
      ? `${input.latestPackLine}${input.deliverySource ? ` · delivered via ${input.deliverySource}` : ""}`
      : "No disclosure imported yet.",
    disclosureAsks: input.disclosureAsks,
    unresolvedGaps: input.unresolvedGaps,
    preparedDrafts: input.preparedDrafts,
    changed: input.changed,
    disclaimer:
      "Orientation only — a source-backed snapshot for review before court or a call. Not case theory, legal advice, or submissions.",
  };
}
