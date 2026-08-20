import type { Rubric, ExtractedField, Gap } from "./types";

/** Deterministic gap analysis: required fields/docs not satisfied. */
export function computeGaps(
  rubric: Rubric,
  fields: ExtractedField[],
  documentsPresent: string[],
): Gap[] {
  const gaps: Gap[] = [];
  const byKey = new Map(fields.map((f) => [f.key, f]));

  for (const f of rubric.fields) {
    if (!f.required) continue;
    const extracted = byKey.get(f.key);
    if (!extracted || !extracted.present) {
      gaps.push({
        key: f.key,
        label: f.label,
        kind: "field",
        // A grounded workflow consequence — what the missing item blocks — never
        // invented advice. Names the firm's own rulebook and the next stage.
        reason: `Required by the ${rubric.name} rulebook — the matter can't be marked ready until this is confirmed.`,
      });
    }
  }
  for (const d of rubric.documents) {
    if (!d.required) continue;
    if (!documentsPresent.includes(d.key)) {
      gaps.push({
        key: d.key,
        label: d.label,
        kind: "document",
        // Honest: Briefly notices whether the client REFERENCED the document in the
        // enquiry; it doesn't open the file. So "not yet referenced", not "unread".
        reason: `Required by the ${rubric.name} rulebook — the client hasn't referenced it yet; needed before the matter can move to review.`,
      });
    }
  }
  return gaps;
}

/** Deterministic readiness: satisfied required items / total required items. */
export function computeReadiness(rubric: Rubric, gaps: Gap[]): number {
  const totalRequired =
    rubric.fields.filter((f) => f.required).length +
    rubric.documents.filter((d) => d.required).length;
  if (totalRequired === 0) return 100;
  const satisfied = totalRequired - gaps.length;
  return Math.round((satisfied / totalRequired) * 100);
}
