/**
 * NZ immigration rubric packs (P2) — pure, client-safe.
 *
 * Three books, keyed by stream: partner, aewv, student. Each item has a type and a
 * party scope; a gap is a `document_present` item that applies to a party and isn't
 * satisfied. Dates (`document_valid_until` / `date`) are declared here but stay
 * empty-but-typed until P3. `fact` items are only ever filled from a source. `human_only`
 * items are the adviser's judgment and are NEVER extracted (relationship/job genuine,
 * English sufficient, pay meets threshold).
 *
 * Lint (runs at save via lintBook): if an item can't be evidenced from a file or a reply
 * it must be `human_only` or it's deleted; every non-matter item must name a party scope.
 */

import type { MigrationStream } from "./types";

export type MigItemType =
  | "document_present"
  | "document_valid_until"
  | "fact"
  | "date"
  | "party"
  | "human_only";

/** Which party (or parties) an item attaches to. */
export type ItemScope =
  | "each_applicant" // principal + partner-if-applying + children
  | "principal"
  | "child" // each child applicant, only when one exists
  | "sponsor"
  | "employer"
  | "worker" // = applicants[0] on AEWV
  | "matter"; // matter-level, no party

/** A condition that makes an item N/A (not a gap) rather than outstanding. */
export type NaCond =
  | { when: "not_onshore" } // current visa: only if that person is onshore
  | { when: "child" } // e.g. police cert: not for child applicants
  | { when: "sponsor_status"; equals: "nz_citizen" | "resident" };

export interface MigItem {
  key: string; // stable slug
  label: string;
  type: MigItemType;
  scope: ItemScope;
  /** N/A conditions — evaluated against the party/profile; N/A ≠ gap. */
  na?: NaCond;
  /** Adviser may dismiss; not a hard gap. */
  optional?: boolean;
  /** One instance per country of residence ≥12 months (police certs). */
  perCountry?: boolean;
}

export interface MigBook {
  stream: MigrationStream;
  name: string;
  items: MigItem[];
}

// ── Book 1 — partner (of a NZ citizen OR resident; sponsor.status drives N/A) ──
const PARTNER_BOOK: MigBook = {
  stream: "partner",
  name: "Partner of a New Zealander",
  items: [
    // each applicant
    { key: "passport", label: "Passport", type: "document_present", scope: "each_applicant" },
    { key: "passport_expiry", label: "Passport expiry", type: "document_valid_until", scope: "each_applicant" },
    { key: "current_visa", label: "Current visa / entry stamps", type: "document_present", scope: "each_applicant", na: { when: "not_onshore" } },
    { key: "police_cert", label: "Police certificate", type: "document_present", scope: "each_applicant", na: { when: "child" }, perCountry: true },
    { key: "police_cert_validity", label: "Police certificate acceptable-until", type: "document_valid_until", scope: "each_applicant", na: { when: "child" } },
    { key: "emedical", label: "eMedical / chest x-ray", type: "document_present", scope: "each_applicant" },
    { key: "emedical_validity", label: "eMedical validity", type: "document_valid_until", scope: "each_applicant" },
    // principal only
    { key: "english_present", label: "English evidence (test / passport country / listed proof)", type: "document_present", scope: "principal" },
    { key: "english_sufficient", label: "English sufficient", type: "human_only", scope: "principal" },
    // child only
    { key: "custody_consent", label: "Custody / consent to include child", type: "document_present", scope: "child" },
    // sponsor
    { key: "sponsor_identity", label: "Sponsor identity (passport or birth/citizenship cert)", type: "document_present", scope: "sponsor" },
    { key: "sponsor_citizenship", label: "Evidence of NZ citizenship", type: "document_present", scope: "sponsor", na: { when: "sponsor_status", equals: "resident" } },
    { key: "sponsor_residence", label: "Evidence of NZ residence", type: "document_present", scope: "sponsor", na: { when: "sponsor_status", equals: "nz_citizen" } },
    { key: "sponsorship_form", label: "Sponsorship form / undertakings signed", type: "document_present", scope: "sponsor" },
    // matter
    { key: "partnership_joint_docs", label: "Partnership evidence — joint documents", type: "document_present", scope: "matter" },
    { key: "partnership_comms", label: "Partnership evidence — communications / photos", type: "document_present", scope: "matter" },
    { key: "relationship_history", label: "Relationship history statement", type: "document_present", scope: "matter" },
    { key: "inz_forms", label: "INZ application form(s) present", type: "document_present", scope: "matter" },
    { key: "lodgement_target", label: "Lodgement target", type: "date", scope: "matter" },
    { key: "inz_app_number", label: "INZ application number", type: "fact", scope: "matter" },
    { key: "fees_paid", label: "Fees paid", type: "fact", scope: "matter" },
    { key: "relationship_genuine", label: "Relationship genuine and stable", type: "human_only", scope: "matter" },
  ],
};

// ── Book 2 — AEWV (worker + employer on one matter) ───────────────────────────
const AEWV_BOOK: MigBook = {
  stream: "aewv",
  name: "AEWV — Accredited Employer Work Visa",
  items: [
    // worker
    { key: "passport", label: "Passport", type: "document_present", scope: "worker" },
    { key: "passport_expiry", label: "Passport expiry", type: "document_valid_until", scope: "worker" },
    { key: "current_visa", label: "Current visa", type: "document_present", scope: "worker", na: { when: "not_onshore" } },
    { key: "qualifications", label: "Qualifications for the role", type: "document_present", scope: "worker", optional: true },
    { key: "english_present", label: "English test result (if required)", type: "document_present", scope: "worker", optional: true },
    { key: "police_cert", label: "Police certificate (if required)", type: "document_present", scope: "worker", perCountry: true, optional: true },
    { key: "emedical", label: "Medical (if required)", type: "document_present", scope: "worker", optional: true },
    { key: "emedical_validity", label: "Medical validity", type: "document_valid_until", scope: "worker", optional: true },
    // employer
    { key: "accreditation_evidence", label: "Employer accreditation evidence", type: "document_present", scope: "employer" },
    { key: "accreditation_status", label: "Accreditation status", type: "fact", scope: "employer" },
    { key: "job_token", label: "Job check approval / job token", type: "document_present", scope: "employer" },
    { key: "employment_agreement", label: "Signed employment agreement", type: "document_present", scope: "employer" },
    { key: "offered_pay", label: "Offered pay rate", type: "fact", scope: "employer" },
    { key: "role_anzsco", label: "Role / ANZSCO", type: "fact", scope: "employer" },
    // judgment
    { key: "job_genuine", label: "Job is genuine", type: "human_only", scope: "employer" },
    { key: "pay_meets_threshold", label: "Pay meets median-wage threshold", type: "human_only", scope: "employer" },
  ],
};

// ── Book 3 — Student (thin) ───────────────────────────────────────────────────
const STUDENT_BOOK: MigBook = {
  stream: "student",
  name: "Student visa",
  items: [
    { key: "passport", label: "Passport", type: "document_present", scope: "each_applicant" },
    { key: "passport_expiry", label: "Passport expiry", type: "document_valid_until", scope: "each_applicant" },
    { key: "offer_or_coe", label: "Offer of place / CoE", type: "document_present", scope: "each_applicant" },
    { key: "funds", label: "Evidence of funds", type: "document_present", scope: "each_applicant" },
    { key: "insurance", label: "Insurance", type: "document_present", scope: "each_applicant" },
    { key: "medical_police", label: "Medical / police (if required)", type: "document_present", scope: "each_applicant", optional: true },
    { key: "bona_fide", label: "Bona fide / genuine intent", type: "human_only", scope: "each_applicant" },
  ],
};

const BOOKS: Record<string, MigBook> = {
  partner: PARTNER_BOOK,
  aewv: AEWV_BOOK,
  student: STUDENT_BOOK,
};

/** The rubric book for a stream, or null (resident/visitor have no book yet). */
export function getBook(stream: MigrationStream | undefined): MigBook | null {
  return stream ? BOOKS[stream] ?? null : null;
}

export const ALL_BOOKS: MigBook[] = [PARTNER_BOOK, AEWV_BOOK, STUDENT_BOOK];

// ── Lint (runs at save) ───────────────────────────────────────────────────────
const SLUG = /^[a-z0-9_]+$/;
const EVIDENCEABLE: MigItemType[] = ["document_present", "document_valid_until", "fact", "date", "party"];

/** Validate a book: slugged unique keys, party scope present, types coherent. Returns errors. */
export function lintBook(book: MigBook): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  for (const it of book.items) {
    if (!SLUG.test(it.key)) errs.push(`${book.stream}/${it.key}: key not slugged`);
    if (seen.has(it.key)) errs.push(`${book.stream}/${it.key}: duplicate key`);
    seen.add(it.key);
    if (!it.scope) errs.push(`${book.stream}/${it.key}: no party scope`);
    // Evidenceable types must name a source-bearing type; anything else must be human_only.
    if (!EVIDENCEABLE.includes(it.type) && it.type !== "human_only") {
      errs.push(`${book.stream}/${it.key}: unknown type ${it.type}`);
    }
  }
  return errs;
}
