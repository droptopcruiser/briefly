/**
 * The migration path's shared helpers — pure and client-safe.
 *
 * The immigration pivot's foundation: how to detect a migration matter, how to title
 * it (family surname / stream / onshore-offshore — never "Property Purchase · …"), and
 * how to group person-scoped items so a family is never flattened into one list.
 */

import type { MigrationStream, MigrationProfile, Applicant } from "./types";

/** Human labels for each stream — the readable half of a matter title and the classifier readout. */
export const STREAM_LABEL: Record<MigrationStream, string> = {
  partner: "Partner of a New Zealander",
  aewv: "AEWV",
  student: "Student",
  resident: "Resident visa",
  visitor: "Visitor visa",
};

/** True when a matter runs on the migration path — so the UI hides property nouns,
 *  uses NZ validity dates, and says "ready to lodge / for consult" not "for settlement". */
export function isMigrationMatter(
  result: { migration?: MigrationProfile | null; vertical?: string } | null | undefined,
): boolean {
  if (!result) return false;
  return result.migration != null || result.vertical === "Immigration";
}

/** The principal applicant (falls back to the first person on the matter). */
export function principalApplicant(profile: MigrationProfile): Applicant | null {
  return profile.applicants.find((a) => a.role === "principal") ?? profile.applicants[0] ?? null;
}

/** Look up a person by id — for scoping a gap/fact/date back to whose it is. */
export function applicantById(profile: MigrationProfile, personId: string | undefined): Applicant | null {
  if (!personId) return null;
  return profile.applicants.find((a) => a.id === personId) ?? null;
}

/** Surname for titling — the last whitespace-separated token of the full name. */
function surname(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : fullName.trim();
}

/**
 * Matter title in the locked format, e.g. "Chen / Partner of a New Zealander / offshore".
 * Never the conveyancing "Property Purchase · Tomas Nowak" shape.
 */
export function migrationMatterTitle(profile: MigrationProfile): string {
  const p = principalApplicant(profile);
  const name = p ? surname(p.fullName) : "Applicant";
  const loc = p ? p.location : "offshore";
  return `${name} / ${STREAM_LABEL[profile.stream]} / ${loc}`;
}

/** Group person-scoped items by applicant, in matter order (principal first), with a
 *  trailing "matter-level" bucket for items with no personId (fees, application number).
 *  The shape brief/packet/chase all use so a family never collapses into one list. */
export function groupByPerson<T extends { personId?: string }>(
  profile: MigrationProfile,
  items: T[],
): { applicant: Applicant | null; items: T[] }[] {
  const groups: { applicant: Applicant | null; items: T[] }[] = profile.applicants.map((a) => ({
    applicant: a,
    items: items.filter((it) => it.personId === a.id),
  }));
  const matterLevel = items.filter((it) => !it.personId || !profile.applicants.some((a) => a.id === it.personId));
  if (matterLevel.length) groups.push({ applicant: null, items: matterLevel });
  return groups;
}
