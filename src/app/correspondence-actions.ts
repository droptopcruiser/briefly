"use server";

import { requireUser } from "@/lib/auth";
import { getMatter } from "@/lib/store";
import { getCurrentAccount, DEFAULT_ACCOUNT_ID } from "@/lib/metering";
import { addEvent } from "@/lib/events";
import { preSendCheck, type PreSendFlag } from "@/lib/correspondence";
import {
  createCorrespondence,
  getActiveCorrespondence,
  approveCorrespondence,
  type CorrespondenceRun,
} from "@/lib/correspondence-service";

/**
 * Actions for the Draft Correspondence workflow. Preparing returns the draft AND its
 * Pre-Send flags, so the client shows immediately what still needs counsel's eye.
 * Everything is a DRAFT — counsel edits and sends from their own mail client.
 */

async function loadMatter(id: string) {
  const account = await getCurrentAccount();
  const accountId = account?.id ?? DEFAULT_ACCOUNT_ID;
  const matter = await getMatter(id, accountId);
  return { account, matter };
}

export type CorrespondenceResult =
  | { ok: true; run: CorrespondenceRun; flags: PreSendFlag[] }
  | { ok: false; reason: string };

/** Prepare a correspondence draft from counsel's addressee / matter / point. */
export async function prepareCorrespondence(
  matterId: string,
  to: string,
  about: string,
  point: string,
): Promise<CorrespondenceResult> {
  await requireUser();
  const p = (point ?? "").trim();
  if (!p) return { ok: false, reason: "Say what the letter needs to make clear." };

  const { matter } = await loadMatter(matterId);
  if (!matter?.result) return { ok: false, reason: "Matter not found." };

  const run = await createCorrespondence(matter, { to: to.trim() || null, about: about.trim(), point: p });
  if (!run) return { ok: false, reason: "Couldn't prepare the draft." };

  const flags = preSendCheck(run.content.draft, matter.result, matter.submission ?? "");
  await addEvent(
    matter.accountId,
    matter.id,
    "correspondence_prepared",
    `Correspondence drafted (v${run.version})${flags.length ? ` · ${flags.length} pre-send ${flags.length === 1 ? "flag" : "flags"}` : ""}`,
  );
  return { ok: true, run, flags };
}

/** Mark the correspondence reviewed by counsel. Records who/when. Sends nothing. */
export async function reviewCorrespondence(matterId: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const { matter } = await loadMatter(matterId);
  if (!matter) return { ok: false };
  const run = await getActiveCorrespondence(matterId);
  if (!run) return { ok: false };
  if (run.state !== "approved") {
    await approveCorrespondence(run, user.id);
    await addEvent(matter.accountId, matter.id, "correspondence_reviewed", `Correspondence v${run.version} reviewed by counsel`);
  }
  return { ok: true };
}
