"use server";

import { requireUser } from "@/lib/auth";
import { getMatter } from "@/lib/store";
import { getCurrentAccount, DEFAULT_ACCOUNT_ID } from "@/lib/metering";
import { matterSourceList } from "@/lib/source-lock-service";
import { exportGate, type ExportViolation } from "@/lib/source-lock";
import { getActiveCorrespondence } from "@/lib/correspondence-service";
import { getActiveDisclosureNote } from "@/lib/disclosure-service";
import { buildDocx, type Block } from "@/lib/docx";
import type { DisclosureNote } from "@/lib/disclosure";

/**
 * The EXPORT GATE, wired. A letter or note may only leave the tool if every number,
 * date, PRN/CRN, and name it asserts is on the matter's sourced list. Bracketed gaps
 * still export. Blocked → the caller shows exactly what's unsupported.
 *
 * Two shapes come out: .txt (plain content) and .docx (#3 — a Times New Roman Word file,
 * no cover page, no colour, carrying the SAME content as the .txt). The .docx is returned
 * base64-encoded so the client can download it as a real binary.
 */

export type DocxExportResult =
  | { ok: true; base64: string; fileName: string }
  | { ok: false; violations: ExportViolation[] }
  | { ok: false; reason: string };

async function loadMatter(id: string) {
  const account = await getCurrentAccount();
  const accountId = account?.id ?? DEFAULT_ACCOUNT_ID;
  return getMatter(id, accountId);
}

function noteToText(n: DisclosureNote): string {
  const lines: string[] = [];
  lines.push(`DISCLOSURE NOTE — Pack ${n.packNo}${n.packDate ? ` (${n.packDate})` : ""}`);
  if (n.deliverySource) lines.push(`Delivered via: ${n.deliverySource}`);
  lines.push("", "WHAT'S NEW", ...n.whatIsNew.map((w) => `  - ${w}`));
  if (n.witnesses.length) lines.push("", `Witnesses: ${n.witnesses.join("; ")}`);
  lines.push("", "INITIAL DISCLOSURE", ...n.initialDisclosureChecklist.map((c) => `  [${c.present ? "x" : " "}] ${c.item}`));
  if (n.clashes.length) lines.push("", "TO CHECK", ...n.clashes.map((c) => `  - ${c}`));
  if (n.asks.length) lines.push("", "REQUESTS", ...n.asks.map((a, i) => `  ${i + 1}. ${a.text}`));
  if (n.draftLetter) lines.push("", "DRAFT REQUEST LETTER", n.draftLetter);
  return lines.join("\n");
}

// ── .docx export (#3) — same content the .txt carried, laid into a Word document ──

// Section labels in the note text that read as headings (bolded in the .docx).
const NOTE_SECTIONS = new Set(["WHAT'S NEW", "INITIAL DISCLOSURE", "TO CHECK", "REQUESTS", "DRAFT REQUEST LETTER"]);

/** The note's exact exported text → Word paragraphs, with the title and section labels bold. */
function noteDocxBlocks(text: string): Block[] {
  return text.split("\n").map((line): Block => {
    const t = line.trim();
    if (/^DISCLOSURE NOTE/.test(t)) return { text: line, heading: true };
    if (NOTE_SECTIONS.has(t)) return { text: line, bold: true };
    return { text: line };
  });
}

/**
 * The exported LETTER is what goes out, so the internal reviewer footer comes off it —
 * a bracketed "[Reviewer note: …]" or a "…before sending" review instruction. Genuine
 * gap brackets counsel must fill ([Chambers], [addressee], a missing PRN/date) stay in.
 * The export gate still runs on the ORIGINAL body; this only shapes the rendered letter.
 */
function stripReviewerFooter(body: string): string {
  const isReviewerNote = (line: string): boolean => {
    const t = line.trim();
    if (!/^\[[^\]]*\]$/.test(t)) return false; // only a line that is entirely one bracket
    const inner = t.slice(1, -1);
    return /^\s*reviewer note\b/i.test(inner) || /\bbefore (?:sending|this letter is sent)\b/i.test(inner);
  };
  return body
    .split("\n")
    .filter((l) => !isReviewerNote(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+$/, "");
}

/** The letter's content (subject + body, reviewer footer removed) → Word paragraphs. */
function letterDocxBlocks(subject: string, body: string): Block[] {
  const blocks: Block[] = [{ text: subject, heading: true }, { text: "" }];
  for (const line of stripReviewerFooter(body).split("\n")) blocks.push({ text: line });
  return blocks;
}

export async function exportCorrespondenceDocx(matterId: string): Promise<DocxExportResult> {
  await requireUser();
  const matter = await loadMatter(matterId);
  if (!matter?.result) return { ok: false, reason: "Matter not found." };
  const run = await getActiveCorrespondence(matterId);
  if (!run) return { ok: false, reason: "No correspondence prepared yet." };

  const list = await matterSourceList(matterId, matter.submission ?? "", matter.result);
  const body = run.content.draft.body;
  const violations = exportGate(body, list);
  if (violations.length) return { ok: false, violations };

  const bytes = buildDocx(letterDocxBlocks(run.content.draft.subject, body));
  return { ok: true, base64: Buffer.from(bytes).toString("base64"), fileName: "correspondence.docx" };
}

export async function exportDisclosureNoteDocx(matterId: string): Promise<DocxExportResult> {
  await requireUser();
  const matter = await loadMatter(matterId);
  if (!matter?.result) return { ok: false, reason: "Matter not found." };
  const run = await getActiveDisclosureNote(matterId);
  if (!run) return { ok: false, reason: "No disclosure note prepared yet." };

  const text = noteToText(run.content);
  const list = await matterSourceList(matterId, matter.submission ?? "", matter.result);
  const violations = exportGate(text, list);
  if (violations.length) return { ok: false, violations };

  const bytes = buildDocx(noteDocxBlocks(text));
  return { ok: true, base64: Buffer.from(bytes).toString("base64"), fileName: `disclosure-note-pack-${run.content.packNo}.docx` };
}
