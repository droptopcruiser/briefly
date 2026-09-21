/**
 * P4 — the consultation packet. Pure, client-safe, headless-testable.
 *
 * What the adviser takes into the consult — NOT the work brief, NOT a lodgement file.
 * Source-locked: a fact line with no source does not print; omitted lines are counted
 * under "held back" (that's source-lock working, not a bug). Never includes genuineness
 * verdicts, fee quotes, likely-outcome, settlement/finance, or model prose untethered to
 * a sourced fact.
 *
 * Sections, in order: Header · People · Key dates · On file (sourced) · Outstanding (by
 * person) · Ask in the room · Held back.
 */

import type { ExtractedField, Gap, MigrationProfile } from "./types";
import type { MigBook } from "./migration-books";
import type { StripSeg } from "./migration-dates";
import type { Block } from "./docx";

const MATTER_PARTY_ID = "matter";

export interface PacketPerson {
  personId: string;
  name: string;
  heading: string;
  role?: string;
  location?: string;
  nationality?: string;
}
export interface OnFileLine { item: string; person: string; source: string }
export interface OutstandingGroup { who: string; unassigned: boolean; items: string[] }

export interface PacketContent {
  header: { title: string; stream?: string; streamDetail?: string; consultDate: string | null; version: number; status: string; generated: string };
  people: PacketPerson[];
  keyDates: StripSeg[];
  onFile: OnFileLine[];
  heldBackCount: number;
  outstanding: OutstandingGroup[];
  askInRoom: string[];
}

export interface PacketInput {
  title: string;
  profile: MigrationProfile;
  book: MigBook;
  facts: ExtractedField[];
  gaps: Gap[];
  keyDates: StripSeg[];
  consultDate: string | null;
  version: number;
  generated: string;
  /** True once counsel has approved the packet for consult — flips "draft" to "approved". */
  approved?: boolean;
}

/** Ordered addressable parties: applicants → sponsor → employer (+ matter for lookups). */
function partyList(profile: MigrationProfile): PacketPerson[] {
  const out: PacketPerson[] = profile.applicants.map((a) => ({
    personId: a.id,
    name: a.fullName,
    heading: `Applicant · ${a.role}`,
    role: a.role,
    location: a.location !== "unknown" ? a.location : undefined,
    nationality: a.nationality,
  }));
  if (profile.sponsor) out.push({ personId: profile.sponsor.id, name: profile.sponsor.fullName, heading: "Sponsor · NZ partner" });
  if (profile.employer) out.push({ personId: profile.employer.id, name: profile.employer.legalName, heading: "Employer" });
  return out;
}

function nameOf(profile: MigrationProfile, personId: string | undefined): string {
  if (!personId || personId === MATTER_PARTY_ID) return "Matter";
  const a = profile.applicants.find((x) => x.id === personId);
  if (a) return a.fullName;
  if (profile.sponsor?.id === personId) return profile.sponsor.fullName;
  if (profile.employer?.id === personId) return profile.employer.legalName;
  return "Unassigned";
}

export function buildConsultationPacket(input: PacketInput): PacketContent {
  const { profile, book, facts, gaps, keyDates } = input;
  const people = partyList(profile);

  // On file (sourced) — a fact prints ONLY with a source; others are held back.
  const onFile: OnFileLine[] = [];
  let heldBackCount = 0;
  for (const f of facts) {
    if (!f.value) continue;
    if (f.source && f.source.trim()) onFile.push({ item: f.label, person: nameOf(profile, f.personId), source: f.source });
    else heldBackCount++;
  }

  // Outstanding — gaps grouped by party, then Matter, then Unassigned (kept visible).
  const outstanding: OutstandingGroup[] = [];
  for (const p of people) {
    const items = gaps.filter((g) => g.personId === p.personId).map((g) => g.label);
    if (items.length) outstanding.push({ who: p.name, unassigned: false, items });
  }
  const matterItems = gaps.filter((g) => g.personId === MATTER_PARTY_ID).map((g) => g.label);
  if (matterItems.length) outstanding.push({ who: "Matter", unassigned: false, items: matterItems });
  const known = new Set([...people.map((p) => p.personId), MATTER_PARTY_ID]);
  const unassignedItems = gaps.filter((g) => !g.personId || !known.has(g.personId)).map((g) => g.label);
  if (unassignedItems.length) outstanding.push({ who: "Unassigned", unassigned: true, items: unassignedItems });

  // Ask in the room — human_only items + unresolved date conflicts + unassigned gaps.
  const askInRoom: string[] = [];
  for (const it of book.items.filter((i) => i.type === "human_only")) {
    askInRoom.push(`${it.label} — adviser's judgment`);
  }
  for (const seg of keyDates.filter((s) => s.conflict)) askInRoom.push(`${seg.label} — resolve date conflict`);
  if (unassignedItems.length) askInRoom.push(`Assign ${unassignedItems.length} item(s) before treating as ready`);

  return {
    header: {
      title: input.title,
      stream: profile.stream,
      streamDetail: profile.streamDetail,
      consultDate: input.consultDate,
      version: input.version,
      status: input.approved ? "approved · not sent" : "draft — not sent",
      generated: input.generated,
    },
    people,
    keyDates,
    onFile,
    heldBackCount,
    outstanding,
    askInRoom,
  };
}

/** Section names + counts — the compact proof of what the rendered packet contains. */
export function packetSectionList(c: PacketContent): string[] {
  return [
    `Header — ${c.header.title} · ${c.header.streamDetail ?? c.header.stream ?? ""} · v${c.header.version} · ${c.header.status}`,
    `People — ${c.people.length} (${c.people.map((p) => p.name.split(" ")[0]).join(", ")})`,
    `Key dates — ${c.keyDates.length} slots (${c.keyDates.filter((s) => s.stale).length} stale, ${c.keyDates.filter((s) => s.conflict).length} conflict)`,
    `On file (sourced) — ${c.onFile.length} line(s)`,
    `Outstanding — ${c.outstanding.map((g) => `${g.who}:${g.items.length}`).join(" · ")}`,
    `Ask in the room — ${c.askInRoom.length} item(s)`,
    `Held back — ${c.heldBackCount} item(s) not exported (no source)`,
  ];
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MON[m - 1]} ${y}`;
}

/** Render the packet into .docx paragraph blocks (Times New Roman via docx.ts). */
export function packetToDocxBlocks(c: PacketContent): Block[] {
  const b: Block[] = [];
  b.push({ text: c.header.title, heading: true });
  b.push({ text: "Every listed fact is sourced. Missing items are listed as missing." });
  b.push({ text: `${c.header.streamDetail ?? c.header.stream ?? ""}  ·  v${c.header.version}  ·  ${c.header.status}` });
  if (c.header.consultDate) b.push({ text: `Consult: ${fmtISO(c.header.consultDate)}` });
  b.push({ text: `Generated: ${c.header.generated}` });
  b.push({ text: "" });

  b.push({ text: "PEOPLE", bold: true });
  for (const p of c.people) {
    b.push({ text: `${p.name} — ${p.heading}` });
    const meta = [p.location, p.nationality].filter(Boolean).join(" · ");
    if (meta) b.push({ text: `  ${meta}` });
  }
  b.push({ text: "" });

  b.push({ text: "KEY DATES", bold: true });
  for (const s of c.keyDates) {
    const v = s.conflict ? "conflict — resolve" : s.value ? fmtISO(s.value) : "—";
    b.push({ text: `  ${s.label}: ${v}${s.stale ? "  (stale before lodge)" : ""}` });
  }
  b.push({ text: "" });

  b.push({ text: "ON FILE (SOURCED)", bold: true });
  if (!c.onFile.length) b.push({ text: "  (nothing sourced yet)" });
  for (const l of c.onFile) b.push({ text: `  ${l.item} — ${l.person}  [source: ${l.source}]` });
  b.push({ text: "" });

  b.push({ text: "OUTSTANDING", bold: true });
  for (const g of c.outstanding) {
    b.push({ text: `  ${g.who}${g.unassigned ? " — assign before treating as ready" : ""}:` });
    for (const it of g.items) b.push({ text: `    · ${it}` });
  }
  b.push({ text: "" });

  b.push({ text: "ASK IN THE ROOM", bold: true });
  for (const q of c.askInRoom) b.push({ text: `  · ${q}` });
  b.push({ text: "" });

  b.push({ text: `Held back: ${c.heldBackCount} item(s) not exported (no source).` });
  return b;
}
