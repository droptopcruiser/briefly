/**
 * The migration path's shared helpers — pure and client-safe.
 *
 * The immigration pivot's foundation: how to detect a migration matter, how to title
 * it (family surname / stream / onshore-offshore — never "Property Purchase · …"), and
 * how to group person-scoped items so a family — and the sponsor/employer — is never
 * flattened into one list.
 *
 * A `personId` on a gap/fact/date references a PARTY: an Applicant, the Sponsor, or the
 * Employer. Partner-visa gaps attach to the sponsor; AEWV gaps attach to the employer.
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

/** Reserved personId for intentional matter-level items (fees, forms, lodgement) —
 *  distinct from truly-unassigned items (no personId), which are the "Unassigned" bucket. */
export const MATTER_PARTY_ID = "matter";

/** A party a `personId` can point at — an applicant, the sponsor, the employer, or the
 *  matter-level bucket. */
export type PartyKind = "applicant" | "sponsor" | "employer" | "matter";
export interface Party {
  id: string;
  kind: PartyKind;
  name: string;
  /** Role/label for display, e.g. "principal", "child", "sponsor", "employer". */
  sub: string;
}

/** Every addressable party on the matter, in order: applicants (principal first),
 *  then sponsor, then employer. This is the id-space `personId` resolves against. */
export function parties(profile: MigrationProfile): Party[] {
  const out: Party[] = profile.applicants.map((a) => ({
    id: a.id,
    kind: "applicant" as const,
    name: a.fullName,
    sub: a.role,
  }));
  if (profile.sponsor) out.push({ id: profile.sponsor.id, kind: "sponsor", name: profile.sponsor.fullName, sub: "sponsor" });
  if (profile.employer) out.push({ id: profile.employer.id, kind: "employer", name: profile.employer.legalName, sub: "employer" });
  return out;
}

/** Resolve a `personId` to its party (applicant / sponsor / employer), or null. */
export function partyById(profile: MigrationProfile, personId: string | undefined): Party | null {
  if (!personId) return null;
  return parties(profile).find((p) => p.id === personId) ?? null;
}

/** Surname for titling — the last whitespace-separated token of the full name. */
function surname(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : fullName.trim();
}

/**
 * Matter title in the locked format, e.g. "Chen / Partner of a New Zealander / offshore"
 * (principal surname · stream label · principal location). If another applicant differs
 * we do NOT invent a mixed location here — an optional "+N offshore" suffix comes later.
 * Never the conveyancing "Property Purchase · Tomas Nowak" shape.
 */
export function migrationMatterTitle(profile: MigrationProfile): string {
  const p = principalApplicant(profile);
  const name = p ? surname(p.fullName) : "Applicant";
  const loc = p ? p.location : "unknown";
  return `${name} / ${STREAM_LABEL[profile.stream]} / ${loc}`;
}

/**
 * Group person-scoped items into buckets in order: each party (applicants → sponsor →
 * employer), then a "Matter" bucket (personId === MATTER_PARTY_ID — fees, forms,
 * lodgement), then "Unassigned" (party: null) for items with no personId or an
 * unrecognised one. Matter and Unassigned are DISTINCT: matter-level is intentional;
 * unassigned means Briefly couldn't place it and a human must. Empty buckets are dropped,
 * except party buckets which always render so each person is visible.
 */
export function groupByPerson<T extends { personId?: string }>(
  profile: MigrationProfile,
  items: T[],
): { party: Party | null; items: T[] }[] {
  const ps = parties(profile);
  const groups: { party: Party | null; items: T[] }[] = ps.map((p) => ({
    party: p,
    items: items.filter((it) => it.personId === p.id),
  }));
  const matterItems = items.filter((it) => it.personId === MATTER_PARTY_ID);
  if (matterItems.length) {
    groups.push({ party: { id: MATTER_PARTY_ID, kind: "matter", name: "Matter", sub: "matter" }, items: matterItems });
  }
  const known = new Set([...ps.map((p) => p.id), MATTER_PARTY_ID]);
  const unassigned = items.filter((it) => !it.personId || !known.has(it.personId));
  if (unassigned.length) groups.push({ party: null, items: unassigned });
  return groups;
}
