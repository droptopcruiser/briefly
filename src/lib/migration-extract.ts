/**
 * Deterministic migration extraction — pure, client-safe, keyless.
 *
 * P1b of the immigration pivot. Turns an enquiry into { profile, facts, gaps, dates },
 * each item scoped to a PARTY (applicant / sponsor / employer) by personId. This is the
 * keyless path used when no model key is set, and the guardrail for the model path:
 * placement follows fixed rules, and the golden rule is **unset > wrong** — a fact/gap
 * we cannot confidently place keeps personId UNSET (it lands in the UI's "unassigned"
 * bucket) rather than being dumped on the principal.
 *
 * Placement rules (in order):
 *  1. Build parties from cues FIRST, then attach items. Never invent a party for leftovers.
 *  2. applicants[0] is the only principal. The NZ partner is the Sponsor, not an applicant.
 *  3. A name with no role cue creates no party.
 *  4. Never default personId to the principal.
 *  5. One human = one id. The sponsor is never cloned into applicants.
 *  6. Children only when named. "two kids" with no names → matter-level gap, no fake people.
 *  7. Stream from explicit signals only. Weak signal → leave stream/streamDetail unset.
 *  8. Location per person from that person's own words; file-level "move to NZ" ≠ onshore.
 *  9. Passport / client number / current visa attach only when bound to a named person.
 * 10. human_only judgments are never extracted as facts (relationship/job genuine,
 *     pay meets threshold, English sufficient — unless a sourced value exists).
 */

import type {
  MigrationProfile, MigrationStream, Applicant, Sponsor, Employer,
  ExtractedField, Gap, TimelineEvent, ApplicantLocation,
} from "./types";

export interface MigrationExtraction {
  /** Stream may be UNSET when the signal is weak (rule 7) — we never assume "partner".
   *  Otherwise the full keystone MigrationProfile shape. */
  profile: Omit<MigrationProfile, "stream"> & { stream?: MigrationStream };
  facts: ExtractedField[];
  gaps: Gap[];
  dates: TimelineEvent[];
}

const NAME = "[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){1,2}";
const COMPANY = "[A-Z][A-Za-z0-9&.'-]*(?:\\s+[A-Z0-9][A-Za-z0-9&.'-]*)*\\s+(?:Ltd|Limited|Inc|Incorporated|Pty|Company|Co\\.)";

const NZ_PLACES = [
  "new zealand", "auckland", "wellington", "christchurch", "hamilton",
  "tauranga", "dunedin", "napier", "palmerston north", "queenstown",
];
const NZ_STATUS = /\b(nz citizen|new zealand citizen|kiwi citizen|citizen of new zealand|permanent resident|\bpr\b|\bresident\b)\b/i;

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0];
}

/** Does a sentence name this party (by first or full name)? */
function mentions(sentence: string, full: string): boolean {
  const fn = firstName(full).replace(/[^A-Za-z]/g, "");
  return new RegExp(`\\b${fn}(?:'s)?\\b`, "i").test(sentence) || sentence.toLowerCase().includes(full.toLowerCase());
}

function locationFromText(ctx: string): ApplicantLocation {
  // A PRESENT-location cue only. "stay in New Zealand" / "move to NZ" are intent, not a
  // current location, and must not prove onshore — better unknown than a false citation.
  const m = ctx.match(/\b(?:currently|now|already|based|living|located|residing)\s+(?:in|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  if (!m) return "unknown";
  const place = m[1].toLowerCase();
  if (NZ_PLACES.some((p) => place.includes(p))) return "onshore";
  return "offshore"; // a named non-NZ place
}

function detectStream(text: string): { stream?: MigrationStream } {
  const t = text.toLowerCase();
  if (/\baewv\b|accredited employer work visa|job check|job offer/.test(t)) return { stream: "aewv" };
  if (/partner of a new zealander|partnership|partner (?:visa|category)|my (?:husband|wife|partner)/.test(t)) return { stream: "partner" };
  if (/student visa|\bcoe\b|confirmation of enrolment|studying/.test(t)) return { stream: "student" };
  if (/resident visa|residence/.test(t)) return { stream: "resident" };
  if (/visitor visa|visit/.test(t)) return { stream: "visitor" };
  return {};
}

// Outstanding-item cues + a small keyword→label map (text-driven; NOT the rubric book).
const OUTSTANDING = /\b(not done|not booked|not yet|haven'?t|still (?:need|to)|to provide|to be provided|outstanding|missing|can send|will send|yet to|not (?:provided|submitted|completed))\b/i;

function itemLabel(sentence: string): string | null {
  const s = sentence.toLowerCase();
  const country = sentence.match(/\bfrom ([A-Z][a-z]+)\b/)?.[1] ?? (/\bchina\b/i.test(s) ? "China" : null);
  const suffix = country ? ` (${country})` : "";
  if (/police (?:cert|certificate|clearance)|\bnzpc\b/.test(s)) return `Police certificate${suffix}`;
  if (/medical|x-?ray|emedical/.test(s)) return "Medical";
  if (/passport bio|bio page/.test(s)) return "Passport bio page";
  if (/passport/.test(s)) return "Passport";
  if (/job check/.test(s)) return "Job check";
  if (/job token/.test(s)) return "Job token";
  if (/employment agreement|job offer/.test(s)) return "Employment agreement";
  if (/english|ielts|pte/.test(s)) return "English test result";
  if (/funds|bank statement|financial/.test(s)) return "Evidence of funds";
  if (/insurance/.test(s)) return "Insurance";
  if (/residence evidence|proof of (?:status|residence)/.test(s)) return "Sponsor residence evidence";
  return null;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function extractMigration(submission: string, forceStream?: MigrationStream): MigrationExtraction {
  const text = submission.trim();
  const segs = sentences(text);
  const applicants: Applicant[] = [];
  let sponsor: Sponsor | null = null;
  let employer: Employer | null = null;
  const facts: ExtractedField[] = [];
  const gaps: Gap[] = [];
  const dates: TimelineEvent[] = [];

  // P5c: a Move forces the stream; otherwise detect it. Party TYPES follow the stream —
  // a sponsor exists only on the partner stream, an employer only on AEWV — so moving to
  // another book never leaves a sponsor- or employer-shaped party without a cue for it.
  const stream = forceStream ?? detectStream(text).stream;

  // ── Rule 1/2: build parties from cues, principal first ──────────────────────
  // Principal: first-person self, or an explicit worker/applicant cue.
  // NB: no `i` flag on these cue regexes — the NAME pattern is case-sensitive on purpose
  // (an `i` flag lets it swallow following lowercase words like "is a NZ citizen").
  const principalName =
    text.match(new RegExp(`\\bI['’]?\\s?a?m\\s+(${NAME})`))?.[1] ??
    text.match(new RegExp(`\\b[Mm]y name is\\s+(${NAME})`))?.[1] ??
    text.match(new RegExp(`\\b(?:[Ww]orker|[Aa]pplicant|[Pp]rincipal applicant)\\s+(${NAME})`))?.[1] ??
    null;
  if (principalName) {
    applicants.push({ id: "a1", role: "principal", fullName: principalName, location: "unknown" });
  }

  // Spouse: NZ side → sponsor; explicitly applying → partner applicant; else (partner
  // stream) → sponsor, since a "Partner of a New Zealander" matter's other adult is the
  // NZ partner. Never placed in applicants without an applying signal (rule 2/5).
  // Sponsor/partner only exist on the partner stream — on AEWV/Student a named spouse is
  // NOT a party (no sponsor-shaped leftover after a Move).
  const spouse = stream === "partner" ? text.match(new RegExp(`\\b[Mm]y (?:husband|wife|partner)\\s+(${NAME})`)) : null;
  if (spouse) {
    const spouseName = spouse[1];
    const spouseCtx = segs.filter((s) => mentions(s, spouseName)).join(" ");
    const applying = /\b(also apply|is applying|are applying|will apply|include (?:him|her|them)|joint)\b/i.test(spouseCtx);
    const nz = NZ_STATUS.test(spouseCtx);
    if (applying && !nz) {
      applicants.push({ id: `a${applicants.length + 1}`, role: "partner", fullName: spouseName, location: "unknown" });
    } else {
      const status = /\b(nz citizen|new zealand citizen|kiwi citizen)\b/i.test(spouseCtx)
        ? "nz_citizen"
        : /\b(permanent resident|\bpr\b|\bresident\b)\b/i.test(spouseCtx) ? "resident" : undefined;
      sponsor = { id: "sp", fullName: spouseName, status };
    }
  }

  // Children: only when named (rule 6).
  const childRe = new RegExp(`\\b[Oo]ur (?:son|daughter|child|kid)\\s+(${NAME})`, "g");
  let namedChild = false;
  for (const m of text.matchAll(childRe)) {
    namedChild = true;
    applicants.push({ id: `a${applicants.length + 1}`, role: "child", fullName: m[1], location: "unknown" });
  }
  // "two kids/children" with no names → matter-level gap, no fake applicants.
  if (/\b(two|three|four|\d+)\s+(?:kids|children|dependents?)\b/i.test(text) && !namedChild) {
    gaps.push({ key: "dependents_not_identified", label: "Dependants not identified", kind: "field", reason: "Children mentioned but not named — identify each to scope their documents." });
  }

  // Employer (AEWV): job offer / employer cue.
  // Employer only exists on AEWV, and only when one is actually named.
  const emp = stream === "aewv"
    ? (text.match(new RegExp(`\\b(?:[Jj]ob offer from|[Oo]ffer from|[Ee]mployer|[Ww]ork for|[Ee]mployed by)\\s+(${COMPANY})`)) ?? text.match(new RegExp(`\\b(${COMPANY})`)))
    : null;
  if (emp) {
    employer = { id: "emp", legalName: emp[1].trim(), accreditationStatus: "unknown" };
  }

  // ── Rules 8/9: bind per-person attributes from that person's own sentences ───
  for (const a of applicants) {
    const ctx = segs.filter((s) => mentions(s, a.fullName));
    // Nationality — ONLY from a sentence that actually states "<X> passport" or a
    // nationality; the source is that exact sentence, never a nearby first mention.
    const natSent = ctx.find((s) => /\b[A-Z][a-z]+\s+passport\b/.test(s) || /\bnationality[:\s]/i.test(s));
    const nat = natSent
      ? (natSent.match(/\b([A-Z][a-z]+)\s+passport\b/)?.[1] ?? natSent.match(/\bnationality[:\s]+([A-Z][a-z]+)/)?.[1])
      : undefined;
    if (nat) { a.nationality = nat; facts.push({ key: `${a.id}_nationality`, label: "Nationality", value: nat, present: true, source: natSent ?? null, personId: a.id }); }
    // Location — the first sentence with a present-location cue is both the value and
    // the source; intent sentences ("stay in NZ") yield nothing.
    let loc: ApplicantLocation = "unknown";
    let locSent: string | undefined;
    for (const s of ctx) { const l = locationFromText(s); if (l !== "unknown") { loc = l; locSent = s; break; } }
    if (loc !== "unknown") { a.location = loc; facts.push({ key: `${a.id}_location`, label: "Location", value: loc, present: true, source: locSent ?? null, personId: a.id }); }
    const pno = ctx.join(" ").match(/passport (?:no\.?|number)[:\s#]*([A-Z0-9]{5,})/i)?.[1];
    if (pno) a.passportNo = pno;
  }
  if (sponsor) {
    const ctx = segs.filter((s) => mentions(s, sponsor!.fullName));
    if (sponsor.status) facts.push({ key: "sp_status", label: "Sponsor status", value: sponsor.status, present: true, source: ctx[0] ?? null, personId: sponsor.id });
  }

  // ── streamDetail (the real book selector) ───────────────────────────────────
  let streamDetail: string | undefined;
  if (stream === "partner") streamDetail = sponsor?.status === "resident" ? "partner_of_resident" : sponsor?.status === "nz_citizen" ? "partner_of_nz_citizen" : undefined;
  if (stream === "aewv") streamDetail = "aewv_worker";

  // ── Gaps: text-driven only. Item + the single party named in that sentence, else unset ─
  const partyList: { id: string; fullName: string }[] = [
    ...applicants.map((a) => ({ id: a.id, fullName: a.fullName })),
    ...(sponsor ? [{ id: sponsor.id, fullName: sponsor.fullName }] : []),
    ...(employer ? [{ id: employer.id, fullName: employer.legalName }] : []),
  ];
  for (const s of segs) {
    if (!OUTSTANDING.test(s)) continue;
    const label = itemLabel(s);
    if (!label) continue;
    const matched = partyList.filter((p) => mentions(s, p.fullName) || (employer && p.id === employer.id && s.includes(employer.legalName)));
    const personId = matched.length === 1 ? matched[0].id : undefined; // 0 or >1 → unset (rule 4, conflicts)
    gaps.push({ key: `${slug(label)}${personId ? `_${personId}` : ""}`, label, kind: "document", reason: "Stated as outstanding in the enquiry.", ...(personId ? { personId } : {}) });
  }

  // Rule 7: never assume "partner" — omit stream entirely when it wasn't detected.
  const profile: MigrationExtraction["profile"] = {
    ...(stream ? { stream } : {}),
    streamDetail,
    applicants,
    sponsor,
    employer,
  };

  return { profile, facts, gaps, dates };
}
