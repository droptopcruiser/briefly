/**
 * P2 gap generation — pure, client-safe.
 *
 * Expand a rubric book across a matter's parties and emit what's outstanding, each item
 * scoped to the right person (Applicant | Sponsor | Employer) or the matter bucket:
 *  - `document_present` → a Gap, unless N/A for that party or already provided.
 *  - `document_valid_until` / `date` → an empty-but-typed date slot (filled in P3, never guessed).
 *  - `fact` → only when a source supplies it (skipped here until we read one).
 *  - `human_only` → NEVER emitted; the adviser's judgment.
 * Nothing is invented; an item with no applicable party simply doesn't appear.
 */

import type { MigrationProfile, Applicant, Gap, TimelineEvent } from "./types";
import type { MigBook, MigItem, NaCond } from "./migration-books";

// Kept as a local literal (must match MATTER_PARTY_ID in migration.ts) so this module has
// only type imports and stays unit-testable headlessly.
const MATTER_PARTY_ID = "matter";
function principalOf(profile: MigrationProfile): Applicant | null {
  return profile.applicants.find((a) => a.role === "principal") ?? profile.applicants[0] ?? null;
}

export interface MigItemsResult {
  gaps: Gap[];
  /** Empty-but-typed date slots (validity windows, lodgement) for P3. */
  dateSlots: TimelineEvent[];
}

// Demonym → country, for police-cert labels ("Chinese" → "Police certificate (China)").
const COUNTRY: Record<string, string> = {
  chinese: "China", indian: "India", filipino: "Philippines", british: "United Kingdom",
  american: "United States", australian: "Australia", "south african": "South Africa",
  brazilian: "Brazil", german: "Germany", french: "France", japanese: "Japan", korean: "Korea",
};
function countryOf(a: Applicant | null): string | null {
  if (!a?.nationality) return null;
  return COUNTRY[a.nationality.toLowerCase()] ?? a.nationality;
}

interface Target {
  personId: string;
  applicant: Applicant | null;
}

function resolveScope(scope: MigItem["scope"], profile: MigrationProfile): Target[] {
  switch (scope) {
    case "each_applicant":
      return profile.applicants.map((a) => ({ personId: a.id, applicant: a }));
    case "principal": {
      const p = principalOf(profile);
      return p ? [{ personId: p.id, applicant: p }] : [];
    }
    case "child":
      return profile.applicants.filter((a) => a.role === "child" || a.role === "dependent").map((a) => ({ personId: a.id, applicant: a }));
    case "worker":
      return profile.applicants[0] ? [{ personId: profile.applicants[0].id, applicant: profile.applicants[0] }] : [];
    case "sponsor":
      return profile.sponsor ? [{ personId: profile.sponsor.id, applicant: null }] : [];
    case "employer":
      return profile.employer ? [{ personId: profile.employer.id, applicant: null }] : [];
    case "matter":
      return [{ personId: MATTER_PARTY_ID, applicant: null }];
  }
}

function naApplies(na: NaCond | undefined, t: Target, profile: MigrationProfile): boolean {
  if (!na) return false;
  if (na.when === "not_onshore") return !!t.applicant && t.applicant.location !== "onshore";
  if (na.when === "child") return !!t.applicant && (t.applicant.role === "child" || t.applicant.role === "dependent");
  if (na.when === "sponsor_status") return profile.sponsor?.status === na.equals;
  return false;
}

/** Light "already provided" check — only trips on an explicit attach/enclosed/provided
 *  cue near the item's keyword, so we never mistake "can send" or "not done" for provided. */
function looksProvided(item: MigItem, submission: string): boolean {
  const s = submission.toLowerCase();
  const kw = item.label.toLowerCase().split(/\W+/).filter((w) => w.length > 4)[0];
  if (!kw || !s.includes(kw)) return false;
  return /\b(attached|enclosed|provided|uploaded|here is|i've sent|have sent)\b/.test(s);
}

export function buildMigrationGaps(book: MigBook, profile: MigrationProfile, submission: string): MigItemsResult {
  const gaps: Gap[] = [];
  const dateSlots: TimelineEvent[] = [];

  for (const item of book.items) {
    if (item.type === "human_only" || item.type === "party" || item.type === "fact") continue; // never a gap; facts only when sourced (later)
    for (const t of resolveScope(item.scope, profile)) {
      if (naApplies(item.na, t, profile)) continue;

      if (item.type === "document_valid_until" || item.type === "date") {
        dateSlots.push({ date: null, description: item.label, source: `(rulebook: ${book.name} — awaiting date)`, personId: t.personId });
        continue;
      }
      // document_present → a gap unless already provided
      if (looksProvided(item, submission)) continue;
      const country = item.perCountry ? countryOf(t.applicant) : null;
      const label = country ? `${item.label} (${country})` : item.label;
      gaps.push({
        key: `${item.key}_${t.personId}`,
        label,
        kind: "document",
        reason: `Required by the ${book.name} rulebook.`,
        personId: t.personId,
      });
    }
  }

  return { gaps, dateSlots };
}
