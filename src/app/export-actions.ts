"use server";

import { requireUser } from "@/lib/auth";
import { getMatter } from "@/lib/store";
import { getCurrentAccount, DEFAULT_ACCOUNT_ID } from "@/lib/metering";
import { matterSourceList } from "@/lib/source-lock-service";
import { exportGate, type ExportViolation } from "@/lib/source-lock";
import { getActiveCorrespondence } from "@/lib/correspondence-service";
import { getActiveDisclosureNote } from "@/lib/disclosure-service";
import type { DisclosureNote } from "@/lib/disclosure";

/**
 * The EXPORT GATE, wired. A letter or note may only leave the tool if every number,
 * date, PRN/CRN, and name it asserts is on the matter's sourced list. Bracketed gaps
 * still export. Blocked → the caller shows exactly what's unsupported. (This slice
 * returns plain text; the .docx formatting is a later slice.)
 */

export type ExportResult =
  | { ok: true; content: string; fileName: string }
  | { ok: false; violations: ExportViolation[] }
  | { ok: false; reason: string };

async function loadMatter(id: string) {
  const account = await getCurrentAccount();
  const accountId = account?.id ?? DEFAULT_ACCOUNT_ID;
  return getMatter(id, accountId);
}

export async function exportCorrespondence(matterId: string): Promise<ExportResult> {
  await requireUser();
  const matter = await loadMatter(matterId);
  if (!matter?.result) return { ok: false, reason: "Matter not found." };
  const run = await getActiveCorrespondence(matterId);
  if (!run) return { ok: false, reason: "No correspondence prepared yet." };

  const list = await matterSourceList(matterId, matter.submission ?? "");
  const body = run.content.draft.body;
  const violations = exportGate(body, list);
  if (violations.length) return { ok: false, violations };

  const content = `${run.content.draft.subject}\n\n${body}`;
  return { ok: true, content, fileName: "correspondence.txt" };
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

export async function exportDisclosureNote(matterId: string): Promise<ExportResult> {
  await requireUser();
  const matter = await loadMatter(matterId);
  if (!matter?.result) return { ok: false, reason: "Matter not found." };
  const run = await getActiveDisclosureNote(matterId);
  if (!run) return { ok: false, reason: "No disclosure note prepared yet." };

  const text = noteToText(run.content);
  const list = await matterSourceList(matterId, matter.submission ?? "");
  const violations = exportGate(text, list);
  if (violations.length) return { ok: false, violations };

  return { ok: true, content: text, fileName: `disclosure-note-pack-${run.content.packNo}.txt` };
}
