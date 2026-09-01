"use server";

import { requireUser } from "@/lib/auth";
import { getMatter } from "@/lib/store";
import { getCurrentAccount, DEFAULT_ACCOUNT_ID } from "@/lib/metering";
import { addEvent } from "@/lib/events";
import {
  createFileOpenForMatter,
  completeAdminForFileOpen,
  getActiveFileOpen,
  approveFileOpen,
  type FileOpenRun,
  type FileOpenResult,
} from "@/lib/file-open";

/**
 * Actions for the File Open workflow — the criminal-chambers counterpart to the
 * Initial Work Brief actions. Same performance model: they RETURN the run so the
 * client renders it immediately, no revalidatePath in the hot path.
 *
 * The boundary is absolute: these only ever prepare or mark-reviewed a DRAFT.
 * Nothing is sent to anyone; counsel reviews, decides, and sends.
 */

async function loadMatter(id: string) {
  const account = await getCurrentAccount();
  const accountId = account?.id ?? DEFAULT_ACCOUNT_ID;
  const matter = await getMatter(id, accountId);
  return { account, matter };
}

/**
 * Prepare the File Open note and RETURN it (or the blocking gate). Enforces the hard
 * stop in the engine: without the charging document AND Summary of Facts it does not
 * run. Fast path — facts only (adminPending); the admin sections complete separately.
 * Idempotent: returns the existing live run if there is one.
 */
export async function runFileOpen(matterId: string): Promise<FileOpenResult> {
  await requireUser();
  const { matter } = await loadMatter(matterId);
  if (!matter?.result) return { ok: false, reason: "Matter not found.", missing: [] };

  const existing = await getActiveFileOpen(matterId);
  if (existing) return { ok: true, run: existing };

  const res = await createFileOpenForMatter(matter);
  if (res.ok) {
    await addEvent(matter.accountId, matter.id, "file_open_prepared", "File Open note prepared for counsel's review");
  }
  return res;
}

/** Phase two — fill the administrative sections (first letter + first job) if pending. */
export async function completeFileOpenAdmin(matterId: string): Promise<FileOpenRun | null> {
  await requireUser();
  return completeAdminForFileOpen(matterId);
}

/** Mark the note reviewed by counsel. Records who/when. Sends nothing. */
export async function reviewFileOpen(matterId: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const { matter } = await loadMatter(matterId);
  if (!matter) return { ok: false };

  const run = await getActiveFileOpen(matterId);
  if (!run) return { ok: false };
  if (run.state !== "approved") {
    await approveFileOpen(run, user.id);
    await addEvent(
      matter.accountId,
      matter.id,
      "file_open_reviewed",
      `File Open note v${run.version} reviewed by counsel`,
    );
  }
  return { ok: true };
}
