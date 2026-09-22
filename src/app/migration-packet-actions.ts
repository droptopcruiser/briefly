"use server";

import { requireUser } from "@/lib/auth";
import { getMatter, saveMatter } from "@/lib/store";
import { getCurrentAccount, DEFAULT_ACCOUNT_ID } from "@/lib/metering";
import { isMigrationMatter, migrationMatterTitle } from "@/lib/migration";
import { extractMigration } from "@/lib/migration-extract";
import { getBook } from "@/lib/migration-books";
import { buildMigrationGaps } from "@/lib/migration-gaps";
import { fillDatesFromText, datesStrip } from "@/lib/migration-dates";
import { buildConsultationPacket, packetToDocxBlocks, type PacketContent } from "@/lib/migration-packet";
import { buildDocx } from "@/lib/docx";
import { buildSourceList, exportGate, type ExportViolation, type SourcedFact } from "@/lib/source-lock";

/**
 * P4 — consultation packet export. Review-gated (nothing exports until the packet is
 * approved for consult, and new material since approval makes it stale → re-approve),
 * source-locked (a fact the enquiry doesn't back can't ride out; those lines are held
 * back by the builder and the export gate refuses any stray unsourced fact). .docx only.
 */

export type PacketExportResult =
  | { ok: true; base64: string; fileName: string }
  | { ok: false; violations: ExportViolation[] }
  | { ok: false; reason: string };

async function loadMatter(id: string) {
  const account = await getCurrentAccount();
  return getMatter(id, account?.id ?? DEFAULT_ACCOUNT_ID);
}

function surname(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "Applicant";
}

/** Assemble the derived packet for a migration matter (or null if it isn't one). */
function assemble(submission: string, result: NonNullable<Awaited<ReturnType<typeof loadMatter>>>["result"], consultAt: string | null): { packet: PacketContent; sourceList: ReturnType<typeof buildSourceList> } | null {
  if (!result || !isMigrationMatter(result) || !result.migration) return null;
  const profile = result.migration;
  const ex = extractMigration(submission);
  const book = getBook(profile.stream);
  if (!book) return null;
  const { gaps, dateSlots } = buildMigrationGaps(book, profile, submission);
  const slots = fillDatesFromText(dateSlots, submission, profile);
  // Match the UI strip: lodgement + stale + conflict only; empty slots never print.
  const keyDates = datesStrip(profile, slots).filter((s) => (s.label === "Lodge" ? !!s.value : s.stale || s.conflict));
  const generated = new Date().toISOString().slice(0, 10);
  const packet = buildConsultationPacket({
    title: migrationMatterTitle(profile), profile, book, facts: ex.facts, gaps, keyDates,
    consultDate: consultAt, version: 1, generated, approved: true,
  });
  const facts: SourcedFact[] = ex.facts.filter((f) => f.source && f.value).map((f) => ({ value: f.value!, tag: "", kind: "enquiry_snippet" }));
  const sourceList = buildSourceList(facts, [submission, packet.header.title, generated, consultAt ?? "", ...ex.facts.map((f) => f.source ?? "")]);
  return { packet, sourceList };
}

/** Approve the packet for consult (the review gate). Freshly approved = not stale. */
export async function approveMigrationPacket(matterId: string): Promise<{ ok: boolean; reason?: string }> {
  await requireUser();
  const matter = await loadMatter(matterId);
  if (!matter?.result) return { ok: false, reason: "Matter not found." };
  const now = new Date().toISOString();
  matter.approvedAt = now;
  matter.updatedAt = now;
  await saveMatter(matter);
  return { ok: true };
}

export async function exportMigrationPacketDocx(matterId: string): Promise<PacketExportResult> {
  await requireUser();
  const matter = await loadMatter(matterId);
  if (!matter?.result) return { ok: false, reason: "Matter not found." };

  // Review gate.
  if (!matter.approvedAt) return { ok: false, reason: "Approve the packet for consult before exporting." };
  if (matter.updatedAt && matter.updatedAt > matter.approvedAt) {
    return { ok: false, reason: "New material since approval — the packet is stale; re-approve before exporting." };
  }

  const built = assemble(matter.submission ?? "", matter.result, matter.consultationAt ?? null);
  if (!built) return { ok: false, reason: "Not a migration matter with a rubric book." };

  // Source-lock: refuse any unsourced fact that slipped into the rendered packet.
  const blocks = packetToDocxBlocks(built.packet);
  const text = blocks.map((b) => b.text).join("\n");
  const violations = exportGate(text, built.sourceList);
  if (violations.length) return { ok: false, violations };

  const principal = built.packet.people[0]?.name ?? "Applicant";
  const bytes = buildDocx(blocks);
  return {
    ok: true,
    base64: Buffer.from(bytes).toString("base64"),
    fileName: `${surname(principal)}-${built.packet.header.stream}-consult-packet-v${built.packet.header.version}.docx`,
  };
}
