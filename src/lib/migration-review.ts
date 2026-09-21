/**
 * P5b — person-scoped since-review for migration. Pure, client-safe, headless-testable.
 *
 * The since-review lines name the item AND the person, so a family never reads as one
 * blur: "+ Wei sponsor_identity" (provided since the last review) and "Hua eMedical …
 * still missing". Compares the baseline snapshot's gaps against the current (live,
 * attachment-aware) gaps.
 */

import type { Gap, MigrationProfile } from "./types";

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full;
}

function personName(profile: MigrationProfile, personId: string): string {
  if (personId === "matter") return "Matter";
  const a = profile.applicants.find((x) => x.id === personId);
  if (a) return firstName(a.fullName);
  if (profile.sponsor?.id === personId) return firstName(profile.sponsor.fullName);
  if (profile.employer?.id === personId) return profile.employer.legalName;
  return "Unassigned";
}

/** personId is the final "_"-separated segment of a migration gap key (a1/sp/emp/matter). */
function personIdOfKey(key: string): string {
  const i = key.lastIndexOf("_");
  return i >= 0 ? key.slice(i + 1) : "matter";
}

export interface MigrationSinceReview {
  /** Items provided since the last review (gap gone). */
  resolved: string[];
  /** Items still outstanding, person-scoped. */
  stillMissing: string[];
}

export function migrationSinceReview(
  baselineGaps: { key: string; label: string }[],
  currentGaps: Gap[],
  profile: MigrationProfile,
): MigrationSinceReview {
  const currentKeys = new Set(currentGaps.map((g) => g.key));
  const resolved: string[] = [];
  for (const bg of baselineGaps) {
    if (!currentKeys.has(bg.key)) resolved.push(`+ ${personName(profile, personIdOfKey(bg.key))} ${bg.label}`);
  }
  const stillMissing = currentGaps.map((g) => `${personName(profile, g.personId ?? "matter")} ${g.label} still missing`);
  return { resolved, stillMissing };
}
