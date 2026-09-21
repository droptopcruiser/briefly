/**
 * P5a — the document chase. Pure, client-safe, headless-testable.
 *
 * One email, outstanding grouped by person (applicants → sponsor → employer → matter →
 * unassigned). Built from the CURRENT gaps only — no coaching paragraphs unless an item
 * carries a stored how_to string (none yet). It is a DRAFT: counsel edits and sends;
 * Briefly never sends. Threads on "Re: {original}" so the reply lands on the same matter.
 * No genuineness lines (human_only items are never gaps).
 */

import type { MigrationProfile, Gap } from "./types";

const MATTER_PARTY_ID = "matter";

export interface ChaseDraft {
  subject: string;
  body: string;
}

/** how_to lookup hook — returns extra one-line guidance for an item key, or null.
 *  Empty until a book carries stored how_to strings (kept as a seam, not filled). */
function howTo(_gapKey: string): string | null {
  return null;
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full;
}

export function buildMigrationChase(
  profile: MigrationProfile,
  gaps: Gap[],
  opts: { originalSubject?: string | null; streamLabel: string } = { streamLabel: "your application" },
): ChaseDraft {
  const principal = profile.applicants.find((a) => a.role === "principal") ?? profile.applicants[0] ?? null;
  const greetName = principal ? firstName(principal.fullName) : null;

  const lines: string[] = [];
  lines.push(greetName ? `Hi ${greetName},` : "Hi,");
  lines.push("");
  lines.push("To get ready for the consult / lodgement we still need:");

  const block = (heading: string, items: Gap[]) => {
    if (!items.length) return;
    lines.push("");
    lines.push(heading);
    for (const g of items) {
      lines.push(`• ${g.label}`);
      const h = howTo(g.key);
      if (h) lines.push(`  ${h}`);
    }
  };

  // Applicants, in matter order.
  for (const a of profile.applicants) {
    block(a.fullName, gaps.filter((g) => g.personId === a.id));
  }
  // Sponsor / employer, labelled.
  if (profile.sponsor) block(`${profile.sponsor.fullName} (NZ partner)`, gaps.filter((g) => g.personId === profile.sponsor!.id));
  if (profile.employer) block(`${profile.employer.legalName} (employer)`, gaps.filter((g) => g.personId === profile.employer!.id));
  // Matter-level + anything unassigned → "Also".
  const known = new Set([
    ...profile.applicants.map((a) => a.id),
    ...(profile.sponsor ? [profile.sponsor.id] : []),
    ...(profile.employer ? [profile.employer.id] : []),
  ]);
  const also = gaps.filter((g) => g.personId === MATTER_PARTY_ID || !g.personId || !known.has(g.personId));
  block("Also", also);

  lines.push("");
  lines.push("Please reply to this email with the files attached.");

  const subject = opts.originalSubject
    ? `Re: ${opts.originalSubject.replace(/^(re:\s*)+/i, "")}`
    : `${opts.streamLabel} — documents still needed`;

  return { subject, body: lines.join("\n") };
}
