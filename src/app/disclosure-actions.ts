"use server";

import { requireUser } from "@/lib/auth";
import { getMatter } from "@/lib/store";
import { getCurrentAccount, DEFAULT_ACCOUNT_ID } from "@/lib/metering";
import { addEvent } from "@/lib/events";
import { extractPack } from "@/lib/disclosure-ingest";
import {
  savePack,
  nextPackNo,
  createDisclosureNote,
  getActiveDisclosureNote,
  approveDisclosureNote,
  type DisclosureNoteRun,
} from "@/lib/disclosure-service";

/**
 * Actions for the Disclosure Note workflow. Importing a pack and preparing the note
 * both RETURN their result so the client renders immediately (no revalidate in the
 * hot path). The boundary holds: everything is a DRAFT; counsel reviews and sends.
 */

async function loadMatter(id: string) {
  const account = await getCurrentAccount();
  const accountId = account?.id ?? DEFAULT_ACCOUNT_ID;
  const matter = await getMatter(id, accountId);
  return { account, matter };
}

export type ImportResult =
  | { ok: true; packNo: number; itemCount: number; mocked: boolean }
  | { ok: false; reason: string };

/** Import a disclosure index (pasted text) as the next pack on the matter. */
export async function importDisclosurePack(
  matterId: string,
  text: string,
  date: string | null,
): Promise<ImportResult> {
  await requireUser();
  const trimmed = (text ?? "").trim();
  if (!trimmed) return { ok: false, reason: "Paste the disclosure index to import a pack." };

  const { matter } = await loadMatter(matterId);
  if (!matter?.result) return { ok: false, reason: "Matter not found." };

  const packNo = await nextPackNo(matterId);
  const { pack, mocked } = await extractPack(trimmed, packNo, date?.trim() || null);
  if (pack.items.length === 0) {
    return { ok: false, reason: "No numbered index items were found in that text." };
  }
  await savePack(matter, pack);
  await addEvent(
    matter.accountId,
    matter.id,
    "disclosure_pack_imported",
    `Disclosure pack ${packNo} imported · ${pack.items.length} index ${pack.items.length === 1 ? "item" : "items"}`,
  );
  return { ok: true, packNo, itemCount: pack.items.length, mocked };
}

export type PrepareResult = { ok: true; run: DisclosureNoteRun } | { ok: false; reason: string };

/** Prepare (or refresh) the Disclosure Note from the matter's packs. */
export async function prepareDisclosureNote(matterId: string): Promise<PrepareResult> {
  await requireUser();
  const { matter } = await loadMatter(matterId);
  if (!matter?.result) return { ok: false, reason: "Matter not found." };

  const run = await createDisclosureNote(matter);
  if (!run) return { ok: false, reason: "Import a disclosure pack first." };
  await addEvent(
    matter.accountId,
    matter.id,
    "disclosure_note_prepared",
    `Disclosure note prepared (v${run.version}) · ${run.content.asks.length} request${run.content.asks.length === 1 ? "" : "s"} drafted`,
  );
  return { ok: true, run };
}

/** Mark the note reviewed by counsel. Records who/when. Sends nothing. */
export async function reviewDisclosureNote(matterId: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const { matter } = await loadMatter(matterId);
  if (!matter) return { ok: false };
  const run = await getActiveDisclosureNote(matterId);
  if (!run) return { ok: false };
  if (run.state !== "approved") {
    await approveDisclosureNote(run, user.id);
    await addEvent(matter.accountId, matter.id, "disclosure_note_reviewed", `Disclosure note v${run.version} reviewed by counsel`);
  }
  return { ok: true };
}
