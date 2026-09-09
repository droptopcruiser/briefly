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
  /**
   * How the Police actually DELIVERED this pack — the OneDrive share link or the
   * delivery reference — kept as provenance even though the chambers' working copy
   * is filed in Google Drive. The delivery source is never lost just because the
   * working copy lives elsewhere.
   */
  deliverySource?: string | null;
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
  /** The Police delivery source of the latest pack (OneDrive link / reference). */
  deliverySource: string | null;
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

  // What's new — safe, factual language only. A first pack has no prior to diff
  // against, so it's summarised (not every item framed as a change).
  const whatIsNew: string[] = [];
  if (!prev) {
    whatIsNew.push(
      `First pack · ${curr.items.length} ${curr.items.length === 1 ? "item" : "items"} indexed — no prior pack to compare against.`,
    );
  } else {
    for (const a of diff.added) whatIsNew.push(`New — ${a.ref}: ${a.description} (${STATUS_LABEL[a.status]})`);
    for (const u of diff.updated) whatIsNew.push(`Updated — ${u.ref}: ${u.changes.join("; ")}`);
    for (const r of diff.removed) whatIsNew.push(`No longer on the latest index — ${r.ref}: ${r.description}`);
    if (whatIsNew.length === 0) whatIsNew.push("No change to the index since the last pack.");
  }

  // Index summary by category.
  const counts = new Map<DiscCategory, number>();
  for (const i of curr.items) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
  const byCategory = [...counts.entries()].map(([category, count]) => ({ category, count }));

  // Witnesses.
  const witnesses = curr.items.filter((i) => i.category === "statement").map((i) => i.description);

  // Initial-disclosure checklist — ticked ONLY when the item is disclosed in FULL. A
  // part-disclosed, withheld, not-located, or merely-listed item is NOT satisfied.
  const fullyDisclosed = new Set(curr.items.filter((i) => i.status === "full").map((i) => i.category));
  const docsPresent = new Set(result.documentsPresent);
  const initialDisclosureChecklist: ChecklistItem[] = EXPECTED.map((e) => ({
    item: e.label,
    present:
      fullyDisclosed.has(e.category) ||
      (e.category === "charge" && docsPresent.has("charging_document")) ||
      (e.category === "sof" && docsPresent.has("sof")),
  }));

  // A withholding ground stated on the line ("s 18", "s. 8"), or null.
  const groundOf = (i: DisclosureItem): string | null => {
    const m = (i.source ?? i.description).match(/\bs\.?\s?(\d+[A-Za-z]?)\b/);
    return m ? `s ${m[1]}` : null;
  };
  const notLocated = (i: DisclosureItem): boolean =>
    /not located|not held|cannot be located|no longer held/i.test(`${i.description} ${i.source ?? ""}`);

  // Clashes to CHECK (never accusations).
  const clashes: string[] = [];
  for (const i of curr.items) {
    if (i.status === "part" && !groundOf(i)) {
      clashes.push(`${i.ref} is part-disclosed but the index states no ground — confirm the ground with the OC.`);
    }
    if (i.category === "notebook" && /extract|excerpt|pp?\.?\s?\d/i.test(i.description)) {
      clashes.push(`${i.ref} appears to be a notebook extract — confirm the full notebook is disclosed.`);
    }
  }

  // Proper asks (≤ MAX_ASKS). Part / withheld (with or without a stated ground) /
  // not-located / expected-absent each produce an ask. An ask requests the ground or
  // the material — it NEVER asserts the item was improperly withheld. Ordered:
  // expected-absent, then not-located, then withheld, then part-disclosed; within each,
  // items touching an element of the charge rank first.
  const chargeToks = tokens(`${field(result, "charge") ?? ""} ${field(result, "elements") ?? ""}`);
  const chargeTouch = (i: DisclosureItem) => [...tokens(i.description)].some((t) => chargeToks.has(t));
  const asks: Ask[] = [];
  const add = (a: Ask) => {
    if (asks.length >= MAX_ASKS) return;
    if (!asks.some((x) => x.ref === a.ref && x.text === a.text)) asks.push(a);
  };

  const askWithheld = (i: DisclosureItem) => {
    const g = groundOf(i);
    add({
      ref: i.ref,
      reason: `Item ${i.ref} is listed as withheld${g ? ` (${g})` : " with no ground stated"}${chargeTouch(i) ? " and touches an element of the charge" : ""}.`,
      text: g
        ? `Please confirm the basis for withholding item ${i.ref} (stated as ${g}) and provide the material, or the part that can be disclosed.`
        : `Please state the ground on which item ${i.ref} (${i.description}) is withheld.`,
    });
  };
  const askPart = (i: DisclosureItem) => {
    const g = groundOf(i);
    add({
      ref: i.ref,
      reason: `Item ${i.ref} is part-disclosed${g ? ` (${g})` : " with no ground stated"}${chargeTouch(i) ? " and touches an element of the charge" : ""}.`,
      text: `Please provide the balance of item ${i.ref} (${i.description}), or state the ground for withholding the remainder${g ? ` beyond ${g}` : ""}.`,
    });
  };

  // Priority (cap forces a choice): charge-touching withheld/part first, then
  // not-located, then remaining withheld, then part, then expected-absent standards.
  for (const i of curr.items.filter((i) => (i.status === "withheld" || i.status === "part") && chargeTouch(i))) {
    if (i.status === "withheld") askWithheld(i);
    else askPart(i);
  }
  for (const i of curr.items.filter(notLocated)) {
    add({ ref: i.ref, reason: `Item ${i.ref} is recorded as not located.`, text: `Please confirm whether item ${i.ref} (${i.description}) exists or is held elsewhere, and provide it if so.` });
  }
  for (const i of curr.items.filter((i) => i.status === "withheld")) askWithheld(i);
  for (const i of curr.items.filter((i) => i.status === "part")) askPart(i);
  for (const e of EXPECTED) {
    if (!initialDisclosureChecklist.find((c) => c.item === e.label)?.present) {
      add({
        ref: null,
        reason: `${e.label} is a standard initial-disclosure item and is not disclosed in full on the index.`,
        text: `Please confirm whether ${e.label.toLowerCase()} exists in this matter and, if so, provide it or state the ground on which it is withheld.`,
      });
    }
  }

  const capped = asks.slice(0, MAX_ASKS);

  return {
    workflowVersion: DISCLOSURE_NOTE_VERSION,
    packNo: curr.packNo,
    packDate: curr.date,
    deliverySource: curr.deliverySource ?? null,
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
/**
 * Remove synthetic/demo fixture tags (e.g. "[synthetic]") from letter-shaped text.
 * These label demo data on the note's chips, but they must never appear inside a block
 * someone could copy and send. Genuine gap brackets ([defendant not stated], [Chambers])
 * are left untouched — only the fixture labels are stripped.
 */
export function stripFixtureTags(text: string): string {
  return text.replace(/\s*\[synthetic\]/gi, "");
}

export function mockDisclosureLetter(defendant: string | null, prn: string | null, asks: Ask[]): string {
  const re = stripFixtureTags(`${defendant ?? "[defendant not stated]"}${prn ? ` (PRN ${prn})` : ""}`);
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

// ── Deterministic index parsing (pure; also the model-extract fallback) ────────

function categorize(desc: string): DiscCategory {
  const d = desc.toLowerCase();
  if (/charg(?:e|ing)\s+doc|charging/.test(d)) return "charge";
  if (/summary of facts|\bsof\b/.test(d)) return "sof";
  if (/statement/.test(d)) return "statement";
  if (/notebook|job\s?sheet|\bnib\b/.test(d)) return "notebook";
  if (/interview|caution|dvd|eviden(?:ce|tial) video/.test(d)) return "interview";
  if (/photo|image|cctv|footage|\bvideo\b/.test(d)) return "photo";
  if (/exhibit/.test(d)) return "exhibit";
  if (/index/.test(d)) return "index";
  return "other";
}

function statusOf(line: string): DiscStatus {
  const d = line.toLowerCase();
  if (/withheld|not disclosed|redact/.test(d)) return "withheld";
  if (/part[- ]?disclos|partial|extract|excerpt/.test(d)) return "part";
  if (/\bfull\b|disclosed|provided|attached|enclosed/.test(d)) return "full";
  return "listed";
}

function pagesOf(line: string): number | null {
  const range = line.match(/pp?\.?\s*(\d+)\s*[-–]\s*(\d+)/i);
  if (range) return Math.abs(Number(range[2]) - Number(range[1])) + 1;
  const n = line.match(/(\d+)\s*pages?\b/i);
  if (n) return Number(n[1]);
  return null;
}

/** Parse a disclosure index into a pack — one item per numbered line. Grounded:
 *  status is taken as stated, defaulting to the neutral "listed" when unsaid. */
export function parseIndexText(text: string, packNo: number, date: string | null): DisclosurePack {
  const items: DisclosureItem[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    // Require a separator after the number (1. / 1) / 1]) so a bare date line like
    // "5 May 2026" in a messy schedule isn't mistaken for index item 5.
    const m = line.match(/^(\d+(?:\.\d+)?)[.)\]]\s+(.+)$/);
    if (!m) continue;
    const ref = m[1];
    const rest = m[2].trim();
    const description =
      rest.replace(/\s*[—–-]\s*(full|withheld|part[- ]?disclosed|partial|disclosed|listed)\b.*$/i, "").trim() || rest;
    items.push({
      ref,
      description,
      category: categorize(rest),
      status: statusOf(rest),
      pages: pagesOf(rest),
      source: line,
    });
  }
  return { packNo, date, items };
}
