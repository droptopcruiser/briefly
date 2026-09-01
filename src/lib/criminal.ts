/**
 * The criminal matter type and the File Open workflow's SAFETY-CRITICAL core.
 *
 * This module is PURE and client-safe — it imports only domain types, never the
 * database or the model — so the grounding rules (never invent; bracket what's
 * absent) and the hard stop (never run without the charging document + SOF) can be
 * unit-tested in isolation and can never be bypassed by a persistence path.
 *
 * Product boundary (see the Criminal Chambers plan): Briefly PREPARES; counsel
 * reviews, decides, and sends. The File Open note is an administrative first pass —
 * identifiers, charge, elements, disclosure status, an admin first-letter draft, and
 * the first assistant job. It gives NO client advice, and it invents nothing: a fact
 * that isn't in the material is shown as a bracketed gap.
 */

import type { ExtractedField, PipelineResult, Rubric } from "./types";

export const CRIMINAL_RUBRIC_ID = "criminal-matter";

/** The rulebook version stamped on every File Open run, so an output is always
 *  traceable to the rules that produced it. Bump when the workflow's shape changes. */
export const FILE_OPEN_VERSION = "file-open/1";

/**
 * The criminal matter type. The pipeline extracts against these fields/documents,
 * grounded — the required charge + SOF are what the File Open gate checks for.
 */
export const CRIMINAL_RUBRIC: Rubric = {
  id: CRIMINAL_RUBRIC_ID,
  name: "Criminal matter",
  description:
    "A criminal charge before the District or High Court — opened from a charging document and summary of facts, with disclosure to follow.",
  vertical: "Criminal",
  fields: [
    { key: "defendant", label: "Defendant", description: "The name of the person charged.", required: true, type: "string" },
    { key: "prn", label: "PRN", description: "Police record number, if stated.", required: false, type: "string" },
    { key: "crn", label: "CRN", description: "Court record number, if stated.", required: false, type: "string" },
    { key: "court", label: "Court", description: "The court and location of the proceeding.", required: false, type: "string" },
    { key: "charge", label: "Charge(s)", description: "The charge(s) as stated in the charging document.", required: true, type: "string" },
    { key: "act", label: "Act & section", description: "The statute and section charged, if stated.", required: false, type: "string" },
    { key: "offenceDatePlace", label: "Date & place of offence", description: "When and where the offence is alleged to have occurred.", required: false, type: "string" },
    { key: "elements", label: "Elements of the charge", description: "The short elements the prosecution must prove, if stated.", required: false, type: "string" },
    { key: "firstAppearance", label: "First appearance", description: "The date of first appearance, if listed.", required: false, type: "string" },
    { key: "disclosureStatus", label: "Initial disclosure status", description: "What initial disclosure has or hasn't been provided.", required: false, type: "string" },
  ],
  documents: [
    { key: "charging_document", label: "Charging document", description: "The document laying the charge.", required: true },
    { key: "sof", label: "Summary of Facts", description: "The prosecution summary of facts.", required: true },
    { key: "disclosure_index", label: "Disclosure index", description: "The index of the disclosure pack.", required: false },
    { key: "notebooks", label: "Officer notebooks", description: "Officer notebook entries.", required: false },
    { key: "statements", label: "Witness statements", description: "Witness statements.", required: false },
    { key: "exhibit_list", label: "Exhibit list", description: "The list of exhibits.", required: false },
  ],
  // Criminal matters use the File Open / Disclosure Note workflows, not the
  // conveyancing Initial Work Brief.
  prepareBriefWhenReady: false,
};

/** True when a matter is a criminal matter (drives which workflows are offered). */
export function isCriminalMatter(result: { rubricId?: string } | null | undefined): boolean {
  return result?.rubricId === CRIMINAL_RUBRIC_ID;
}

// ── The hard stop ─────────────────────────────────────────────────────────────

export interface RunGate {
  ok: boolean;
  /** Why the workflow can't run yet (null when it can). */
  reason: string | null;
  /** The missing required documents, by label. */
  missing: string[];
}

/**
 * File Open must NEVER run without the charging document AND the Summary of Facts.
 * This is a product hard stop, not a warning.
 */
export function fileOpenGate(result: PipelineResult | null | undefined): RunGate {
  const have = new Set(result?.documentsPresent ?? []);
  const missing: string[] = [];
  if (!have.has("charging_document")) missing.push("charging document");
  if (!have.has("sof")) missing.push("Summary of Facts");
  if (missing.length === 0) return { ok: true, reason: null, missing: [] };
  return { ok: false, reason: `Add the ${missing.join(" and ")} to run File Open.`, missing };
}

// ── The File Open note (content shape) ────────────────────────────────────────

/** One line of the note. `value: null` is an ABSENT fact — rendered as a bracketed
 *  gap by the UI, never filled with a guess. */
export interface NoteItem {
  label: string;
  value: string | null;
  /** Verbatim snippet the value was drawn from, or null. */
  source: string | null;
  /** The document (and page) a value was confirmed from, when applicable. */
  from?: string | null;
}

export interface FileOpenNote {
  workflowVersion: string;
  identifiers: NoteItem[];
  charge: NoteItem[];
  firstAppearance: NoteItem;
  disclosureStatus: NoteItem;
  /** Administrative first letter — acknowledges the file, arranges a meeting. NO
   *  advice; square brackets for anything unknown. Null until the admin phase fills it. */
  clientLetterDraft: string | null;
  /** The first administrative job for the assistant. Null until the admin phase fills it. */
  firstAssistantJob: string | null;
  /** True while the admin sections (letter + job) are still being prepared. */
  adminPending?: boolean;
}

/** Bracketed gap text for an absent fact — the ONLY way an absent fact is shown. */
export function gap(label: string): string {
  return `[${label.toLowerCase()} not stated]`;
}

function toItem(fields: Map<string, ExtractedField>, key: string, label: string): NoteItem {
  const f = fields.get(key);
  if (f && f.present && f.value) {
    const from = f.fromDocument
      ? `${f.fromDocument.fileName}${f.fromDocument.page != null ? ` p.${f.fromDocument.page}` : ""}`
      : null;
    return { label, value: f.value, source: f.source, from };
  }
  return { label, value: null, source: null };
}

/**
 * Assemble the deterministic, source-backed sections of the File Open note from the
 * grounded pipeline result. Purely mechanical: every value carries its source, and
 * anything absent stays null (a bracketed gap) — nothing is invented.
 */
export function buildFileOpenNote(result: PipelineResult): FileOpenNote {
  const fields = new Map(result.fields.map((f) => [f.key, f]));
  return {
    workflowVersion: FILE_OPEN_VERSION,
    identifiers: [
      toItem(fields, "defendant", "Defendant"),
      toItem(fields, "prn", "PRN"),
      toItem(fields, "crn", "CRN"),
      toItem(fields, "court", "Court"),
    ],
    charge: [
      toItem(fields, "charge", "Charge(s)"),
      toItem(fields, "act", "Act & section"),
      toItem(fields, "offenceDatePlace", "Date & place of offence"),
      toItem(fields, "elements", "Elements of the charge"),
    ],
    firstAppearance: toItem(fields, "firstAppearance", "First appearance"),
    disclosureStatus: toItem(fields, "disclosureStatus", "Initial disclosure status"),
    clientLetterDraft: null,
    firstAssistantJob: null,
    adminPending: true,
  };
}

/**
 * The administrative sections, deterministically — used in demo/keyless mode and as
 * the fallback if the model call fails. Strictly administrative: it acknowledges the
 * file and proposes arranging a meeting; it gives NO advice and brackets every
 * unknown, so a missing fact can never be silently invented.
 */
export function mockAdminSections(note: FileOpenNote): {
  clientLetterDraft: string;
  firstAssistantJob: string;
} {
  const get = (label: string) => note.identifiers.find((i) => i.label === label)?.value;
  const name = get("Defendant") ?? "[defendant not stated]";
  const court = get("Court") ?? "[court not stated]";
  const appearance = note.firstAppearance.value ?? "[first appearance not stated]";
  return {
    clientLetterDraft:
      `Dear ${name},\n\n` +
      `Thank you for instructing this chambers. We have opened your file and received the charging document and summary of facts. ` +
      `Your matter is before ${court}, with a first appearance recorded as ${appearance}. ` +
      `We would like to arrange a time to go through the matter with you.\n\n` +
      `[Confirm a meeting time, contact details, and any bail conditions before this letter is sent.]\n\n` +
      `Kind regards,`,
    firstAssistantJob:
      `Open the matter folder, diarise the first appearance (${appearance}, ${court}), ` +
      `and confirm the defendant's current contact details before the first letter goes out.`,
  };
}
