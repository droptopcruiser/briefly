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
        reason: "Required fact not found in the submission.",
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
        reason: "Required document not yet provided.",
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
