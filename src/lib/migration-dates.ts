/**
 * P3 — migration date slots. Pure, client-safe, headless-testable.
 *
 * Fills the empty-but-typed date slots (passport expiry, police-cert acceptable-until,
 * eMedical validity per applicant; lodgement target on the matter) — but ONLY from a
 * cited span in the enquiry. No span → the slot stays empty; nothing is ever guessed or
 * derived ("settlement in 8 days" copy never appears on this path).
 *
 * The resolver is generic and keyed by slot (itemKey + personId), not a settlement enum:
 * two distinct sourced values for the same slot → a conflict that is KEPT UNRESOLVED
 * (both source-cited choices shown), never silently overwritten.
 *
 * Release B (migration): a validity date earlier than the lodgement target is
 * stale_before_lodgement. If the lodgement target is empty, nothing is flagged stale.
 */

import type { MigrationProfile } from "./types";

export interface DateCandidate {
  /** ISO YYYY-MM-DD. */
  value: string;
  /** The verbatim span it was read from. */
  source: string;
}

export interface MigrationDateSlot {
  key: string; // `${itemKey}:${personId}`
  itemKey: string; // passport_expiry | police_cert_validity | emedical_validity | lodgement_target
  personId: string; // applicant id | "matter"
  label: string;
  candidates: DateCandidate[];
}

export type SlotStatus =
  | { state: "empty" }
  | { state: "set"; value: string; source: string }
  | { state: "conflict"; candidates: DateCandidate[] };

const VALIDITY_ITEMS = new Set(["passport_expiry", "police_cert_validity", "emedical_validity"]);
const LODGEMENT_ITEM = "lodgement_target";

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const pad = (n: number) => String(n).padStart(2, "0");

/** Parse the first date in a span to ISO, or null. Only real, explicit dates. */
export function parseDate(span: string): string | null {
  let m = span.match(/\b(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})\b/); // 12 March 2028
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(+m[1])}`;
  m = span.match(/\b([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})\b/); // March 12, 2028
  if (m && MONTHS[m[1].toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[1].toLowerCase()])}-${pad(+m[2])}`;
  m = span.match(/\b(\d{4})-(\d{2})-(\d{2})\b/); // ISO
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = span.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/); // dd/mm/yyyy
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  return null;
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

/** Which slot itemKey a dated sentence is about, by keyword. */
function itemKeyOf(s: string): string | null {
  const t = s.toLowerCase();
  if (/\blodge|lodgement|lodgment\b/.test(t)) return LODGEMENT_ITEM;
  if (/passport/.test(t)) return "passport_expiry";
  if (/police|nzpc/.test(t)) return "police_cert_validity";
  if (/medical|x-?ray|emedical/.test(t)) return "emedical_validity";
  return null;
}

/**
 * Fill slot candidates from cited spans in the submission. Person is resolved by the
 * name mentioned in that span (matter for lodgement); an unnamed validity date fills
 * nothing (unset > wrong). Returns a new slot list; empties stay empty.
 */
export function fillDatesFromText(
  slots: MigrationDateSlot[],
  submission: string,
  profile: MigrationProfile,
): MigrationDateSlot[] {
  const out = slots.map((s) => ({ ...s, candidates: [...s.candidates] }));
  const named: { id: string; first: string }[] = [
    ...profile.applicants.map((a) => ({ id: a.id, first: a.fullName.trim().split(/\s+/)[0] })),
    ...(profile.sponsor ? [{ id: profile.sponsor.id, first: profile.sponsor.fullName.trim().split(/\s+/)[0] }] : []),
  ];

  // A second date about the SAME item in a follow-on sentence ("Also seeing 14 March
  // 2031 on another copy, not sure which is right.") continues the previous dated item,
  // so it lands on the same slot — that's how a conflict gets detected from real prose.
  const CONTINUES = /\b(?:also|another copy|other copy|on another|not sure which|the other one)\b/i;
  let lastKey: string | null = null;
  let lastPerson: string | null = null;

  for (const s of sentences(submission)) {
    const iso = parseDate(s);
    if (!iso) continue;
    let itemKey = itemKeyOf(s);
    let personId: string | null = null;

    if (!itemKey) {
      if (lastKey && lastPerson && CONTINUES.test(s)) {
        itemKey = lastKey;
        personId = lastPerson;
      } else continue;
    } else {
      personId = itemKey === LODGEMENT_ITEM ? "matter" : null;
      if (!personId) {
        const hits = named.filter((n) => new RegExp(`\\b${n.first}(?:'s)?\\b`, "i").test(s));
        if (hits.length === 1) personId = hits[0].id; // exactly one named party, else leave unfilled
      }
      // A validity date with no named party in a SINGLE-applicant matter is the
      // applicant's — "My passport …", "Medical done …" bind to the sole applicant
      // (no ambiguity). In a family (2+ applicants) it stays unfilled: unset > wrong.
      if (!personId && VALIDITY_ITEMS.has(itemKey) && profile.applicants.length === 1) {
        personId = profile.applicants[0].id;
      }
    }
    if (!personId) continue;
    const slot = out.find((sl) => sl.itemKey === itemKey && sl.personId === personId);
    if (!slot) continue;
    if (!slot.candidates.some((c) => c.value === iso)) slot.candidates.push({ value: iso, source: s });
    lastKey = itemKey;
    lastPerson = personId;
  }
  return out;
}

/** A date READ from an attached document (bio page / MRZ), bound to person + item. */
export interface DocDate {
  itemKey: string;
  personId: string;
  value: string; // ISO
  source: string; // e.g. "passport.pdf (read)"
}

/** Document read-facts whose key is a validity slot → dated candidates, per person.
 *  A passport's own expiry becomes a sourced candidate on the conflict — evidence
 *  standing beside the claimed dates, never overwriting them. */
export function docDatesFrom(
  docs: { personId?: string; fileName: string; pendingFacts?: { key: string; value: string }[] }[],
): DocDate[] {
  const out: DocDate[] = [];
  for (const d of docs) {
    if (!d.personId) continue;
    for (const f of d.pendingFacts ?? []) {
      if (!VALIDITY_ITEMS.has(f.key)) continue;
      const iso = parseDate(f.value);
      if (iso) out.push({ itemKey: f.key, personId: d.personId, value: iso, source: `${d.fileName} (read)` });
    }
  }
  return out;
}

/** Merge document-sourced dates into the slots as extra candidates (dedup by value). */
export function mergeDocDates(slots: MigrationDateSlot[], docDates: DocDate[]): MigrationDateSlot[] {
  const out = slots.map((s) => ({ ...s, candidates: [...s.candidates] }));
  for (const d of docDates) {
    const slot = out.find((s) => s.itemKey === d.itemKey && s.personId === d.personId);
    if (!slot) continue;
    if (!slot.candidates.some((c) => c.value === d.value)) slot.candidates.push({ value: d.value, source: d.source });
  }
  return out;
}

export function slotStatus(slot: MigrationDateSlot): SlotStatus {
  const distinct = [...new Map(slot.candidates.map((c) => [c.value, c])).values()];
  if (distinct.length === 0) return { state: "empty" };
  if (distinct.length === 1) return { state: "set", value: distinct[0].value, source: distinct[0].source };
  return { state: "conflict", candidates: distinct };
}

/** Slot keys that are stale-before-lodgement (validity < lodgement). Empty when no lodgement. */
export function staleSlotKeys(slots: MigrationDateSlot[]): Set<string> {
  const stale = new Set<string>();
  const lodge = slots.find((s) => s.itemKey === LODGEMENT_ITEM);
  const lodgeStatus = lodge ? slotStatus(lodge) : { state: "empty" as const };
  if (lodgeStatus.state !== "set") return stale; // no lodgement target → nothing stale
  for (const s of slots) {
    if (!VALIDITY_ITEMS.has(s.itemKey)) continue;
    const st = slotStatus(s);
    if (st.state === "set" && st.value < lodgeStatus.value) stale.add(s.key);
  }
  return stale;
}

const SHORT: Record<string, string> = {
  passport_expiry: "passport", police_cert_validity: "NZPC", emedical_validity: "medical",
};

export interface StripSeg { label: string; value: string | null; conflict: boolean; stale: boolean }

/** The migration strip: "Lodge {date|—} · Hua medical {…} · Hua NZPC {…} · Hua passport {…}" +
 *  the same per applicant where the slots exist. Never any settlement/finance copy. */
export function datesStrip(profile: MigrationProfile, slots: MigrationDateSlot[]): StripSeg[] {
  const stale = staleSlotKeys(slots);
  const seg = (slot: MigrationDateSlot | undefined, label: string): StripSeg | null => {
    if (!slot) return null;
    const st = slotStatus(slot);
    return {
      label,
      value: st.state === "set" ? st.value : null,
      conflict: st.state === "conflict",
      stale: stale.has(slot.key),
    };
  };
  const find = (itemKey: string, personId: string) => slots.find((s) => s.itemKey === itemKey && s.personId === personId);
  const out: (StripSeg | null)[] = [seg(find(LODGEMENT_ITEM, "matter"), "Lodge")];
  for (const a of profile.applicants) {
    const first = a.fullName.trim().split(/\s+/)[0];
    for (const k of ["emedical_validity", "police_cert_validity", "passport_expiry"]) {
      out.push(seg(find(k, a.id), `${first} ${SHORT[k]}`));
    }
  }
  return out.filter((x): x is StripSeg => x !== null);
}
