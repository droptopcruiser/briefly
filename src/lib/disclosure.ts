/**
 * The Disclosure Note workflow's SAFETY-CRITICAL core — pure and client-safe.
 *
 * The value peak counsel named: comparing THIS Police disclosure pack against the
 * LAST one (what's new / updated / no longer listed), rebuilding the index, and
 * drafting the few proper requests — work that takes 45–90 minutes by hand and where
 * a second pack often goes un-diffed.
 *
 * HARD SAFETY RULES (enforced here so no persistence/UI path can bypass them):
 *  - The diff reports only what the indices literally say. It NEVER infers that an
 *    item was improperly withheld — "listed as withheld / part-disclosed" is a fact
 *    from the index; impropriety is a judgment for counsel, never asserted here.
 *  - It invents no missing document. A request is only ever a PROPER ask (see below),
 *    and there are at most FOUR. Anything not stated is a bracketed gap.
 *  - Everything is a DRAFT for counsel to review, edit, and send. Nothing is sent.
 */

import type { PipelineResult } from "./types";

export const DISCLOSURE_NOTE_VERSION = "disclosure-note/1";

/** The most requests a single note may propose — a deliberate discipline. */
export const MAX_ASKS = 4;

export type DiscCategory =
  | "charge"
  | "sof"
  | "statement"
  | "notebook"
  | "exhibit"
  | "photo"
  | "interview"
  | "index"
  | "withheld"
  | "other";

/** As STATED on the index — never inferred. */
export type DiscStatus = "full" | "part" | "withheld" | "listed";

export interface DisclosureItem {
  /** The index reference/number, e.g. "12" or "3.2". */
  ref: string;
  description: string;
  category: DiscCategory;
  status: DiscStatus;
  /** Stated page/entry count, if the index gives one. */
  pages?: number | null;
  /** The verbatim index line, for provenance. */
  source?: string | null;
}

export interface DisclosurePack {
  packNo: number;
  /** ISO date the pack was provided, or null. */
  date: string | null;
  items: DisclosureItem[];
}

// ── The diff (Pack N vs Pack N-1) ─────────────────────────────────────────────

export interface UpdatedItem {
  ref: string;
  from: DisclosureItem;
  to: DisclosureItem;
  /** Plain, factual descriptions of what changed (status/pages/description). */
  changes: string[];
}

export interface PackDiff {
  /** On the latest index, not on the prior one. */
  added: DisclosureItem[];
  /** On the prior index, not on the latest — "no longer on the latest index". */
  removed: DisclosureItem[];
  updated: UpdatedItem[];
  unchanged: number;
}

const STATUS_LABEL: Record<DiscStatus, string> = {
  full: "disclosed in full",
  part: "part-disclosed",
  withheld: "listed as withheld",
  listed: "listed",
};

/**
 * Diff two packs by index reference. Pure set/field comparison — it states what the
 * indices say changed, and nothing more (never why, never impropriety).
 */
export function diffPacks(prev: DisclosurePack | null, curr: DisclosurePack): PackDiff {
  const prevByRef = new Map((prev?.items ?? []).map((i) => [i.ref, i]));
  const currByRef = new Map(curr.items.map((i) => [i.ref, i]));

  const added: DisclosureItem[] = [];
  const updated: UpdatedItem[] = [];
  let unchanged = 0;

  for (const item of curr.items) {
    const before = prevByRef.get(item.ref);
    if (!before) {
      added.push(item);
      continue;
    }
    const changes: string[] = [];
    if (before.status !== item.status) {
      changes.push(`status ${STATUS_LABEL[before.status]} → ${STATUS_LABEL[item.status]}`);
    }
    if ((before.pages ?? null) !== (item.pages ?? null)) {
      changes.push(`pages ${before.pages ?? "—"} → ${item.pages ?? "—"}`);
    }
    if (before.description.trim() !== item.description.trim()) {
      changes.push("description amended");
    }
    if (changes.length) updated.push({ ref: item.ref, from: before, to: item, changes });
    else unchanged++;
  }

  const removed = (prev?.items ?? []).filter((i) => !currByRef.has(i.ref));
  return { added, removed, updated, unchanged };
}

// ── The note ──────────────────────────────────────────────────────────────────

export interface ChecklistItem {
  item: string;
  present: boolean;
}

export interface Ask {
  /** The index ref the ask concerns, or null for an expected-but-absent document. */
  ref: string | null;
  /** Why this is a proper ask — counsel must be able to explain every request. */
  reason: string;
  /** The draft request line. */
  text: string;
}

export interface DisclosureNote {
  workflowVersion: string;
  packNo: number;
  packDate: string | null;
  identifiers: { defendant: string | null; charge: string | null; court: string | null; prn: string | null };
  /** What changed vs the prior pack — safe, factual language. */
  whatIsNew: string[];
  indexSummary: { totalItems: number; byCategory: { category: DiscCategory; count: number }[] };
  witnesses: string[];
  initialDisclosureChecklist: ChecklistItem[];
  /** Inconsistencies to CHECK — never accusations. */
  clashes: string[];
  /** At most MAX_ASKS proper requests. */
  asks: Ask[];
  /** A draft letter, only when there are proper asks. Null otherwise. */
  draftLetter: string | null;
}

function field(result: PipelineResult, key: string): string | null {
  const f = result.fields.find((x) => x.key === key);
  return f && f.present && f.value ? f.value : null;
}

const STOP = new Set(["with", "that", "this", "from", "the", "and", "for", "was", "were", "has", "have"]);
function tokens(s: string): Set<string> {
  return new Set((s.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !STOP.has(w)));
}

/** The initial-disclosure items expected on a first pack, by category. */
const EXPECTED: { label: string; category: DiscCategory }[] = [
  { label: "Charging document", category: "charge" },
  { label: "Summary of Facts", category: "sof" },
  { label: "List of exhibits", category: "exhibit" },
  { label: "Officer notebook(s)", category: "notebook" },
  { label: "Witness statement(s)", category: "statement" },
];

/**
 * Build the Disclosure Note deterministically from the grounded result + the packs.
 * The latest pack is diffed against the previous one; the note rebuilds the index,
 * lists witnesses, checks initial disclosure, flags inconsistencies to check, and
 * proposes at most four PROPER asks — a document expected but not on the index, or a
 * withheld/part item whose description touches an element of the charge.
 */
export function buildDisclosureNote(result: PipelineResult, packs: DisclosurePack[]): DisclosureNote {
  const ordered = [...packs].sort((a, b) => a.packNo - b.packNo);
  const curr = ordered[ordered.length - 1];
  const prev = ordered.length > 1 ? ordered[ordered.length - 2] : null;
  const diff = diffPacks(prev, curr);

  // What's new — safe, factual language only.
  const whatIsNew: string[] = [];
  for (const a of diff.added) whatIsNew.push(`New — ${a.ref}: ${a.description} (${STATUS_LABEL[a.status]})`);
  for (const u of diff.updated) whatIsNew.push(`Updated — ${u.ref}: ${u.changes.join("; ")}`);
  for (const r of diff.removed) whatIsNew.push(`No longer on the latest index — ${r.ref}: ${r.description}`);
  if (!prev && whatIsNew.length === 0) whatIsNew.push("First pack — no prior index to compare against.");

  // Index summary by category.
  const counts = new Map<DiscCategory, number>();
  for (const i of curr.items) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
  const byCategory = [...counts.entries()].map(([category, count]) => ({ category, count }));

  // Witnesses.
  const witnesses = curr.items.filter((i) => i.category === "statement").map((i) => i.description);

  // Initial-disclosure checklist — present if any item on the latest pack matches.
  const present = new Set(curr.items.map((i) => i.category));
  const docsPresent = new Set(result.documentsPresent);
  const initialDisclosureChecklist: ChecklistItem[] = EXPECTED.map((e) => ({
    item: e.label,
    present: present.has(e.category) || (e.category === "charge" && docsPresent.has("charging_document")) || (e.category === "sof" && docsPresent.has("sof")),
  }));

  // Clashes to CHECK (never accusations).
  const clashes: string[] = [];
  for (const i of curr.items) {
    if (i.status === "part" && !/ground|withh|s\.?\s?\d|section|privileg/i.test(i.source ?? i.description)) {
      clashes.push(`${i.ref} is part-disclosed but the index states no ground — confirm the ground with the OC.`);
    }
    if (i.category === "notebook" && /extract|excerpt|pp?\.?\s?\d/i.test(i.description)) {
      clashes.push(`${i.ref} appears to be a notebook extract — confirm the full notebook is disclosed.`);
    }
  }

  // Proper asks (≤ MAX_ASKS): absent expected documents first, then withheld/part
  // items whose description touches an element of the charge.
  const chargeToks = tokens(`${field(result, "charge") ?? ""} ${field(result, "elements") ?? ""}`);
  const asks: Ask[] = [];

  for (const e of EXPECTED) {
    const isPresent = initialDisclosureChecklist.find((c) => c.item === e.label)?.present;
    if (!isPresent) {
      asks.push({
        ref: null,
        reason: `${e.label} is a standard initial-disclosure item and is not on the index.`,
        text: `Please confirm whether ${e.label.toLowerCase()} exists in this matter and, if so, provide it or state the ground on which it is withheld.`,
      });
    }
    if (asks.length >= MAX_ASKS) break;
  }

  if (asks.length < MAX_ASKS && chargeToks.size > 0) {
    for (const i of curr.items) {
      if (asks.length >= MAX_ASKS) break;
      if (i.status !== "withheld" && i.status !== "part") continue;
      const overlap = [...tokens(i.description)].filter((t) => chargeToks.has(t));
      if (overlap.length >= 1) {
        asks.push({
          ref: i.ref,
          reason: `${i.ref} is ${STATUS_LABEL[i.status]} and its description touches an element of the charge (${overlap.join(", ")}).`,
          text: `Please provide the ground for ${i.status === "withheld" ? "withholding" : "part-disclosing"} item ${i.ref} (${i.description}), which appears relevant to the charge.`,
        });
      }
    }
  }

  const capped = asks.slice(0, MAX_ASKS);

  return {
    workflowVersion: DISCLOSURE_NOTE_VERSION,
    packNo: curr.packNo,
    packDate: curr.date,
    identifiers: {
      defendant: field(result, "defendant"),
      charge: field(result, "charge"),
      court: field(result, "court"),
      prn: field(result, "prn"),
    },
    whatIsNew,
    indexSummary: { totalItems: curr.items.length, byCategory },
    witnesses,
    initialDisclosureChecklist,
    clashes,
    asks: capped,
    draftLetter: capped.length ? mockDisclosureLetter(field(result, "defendant"), field(result, "prn"), capped) : null,
  };
}

/**
 * A deterministic draft request letter (demo/keyless mode, or the fallback). Lists
 * only the proper asks, in a short chambers voice; brackets anything not stated. It
 * is a DRAFT — counsel reviews and sends.
 */
export function mockDisclosureLetter(defendant: string | null, prn: string | null, asks: Ask[]): string {
  const re = `${defendant ?? "[defendant not stated]"}${prn ? ` (PRN ${prn})` : ""}`;
  const body = asks.map((a, i) => `${i + 1}. ${a.text}`).join("\n");
  return (
    `Dear Sir/Madam,\n\n` +
    `Re: ${re}\n\n` +
    `Thank you for the disclosure provided. Having reviewed the current pack against the file, we request the following:\n\n` +
    `${body}\n\n` +
    `[Confirm the recipient (OC or disclosure inbox) and review each request before this letter is sent.]\n\n` +
    `Yours faithfully,`
  );
}
