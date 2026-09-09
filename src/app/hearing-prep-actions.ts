"use server";

import { requireUser } from "@/lib/auth";
import { getMatter } from "@/lib/store";
import { getCurrentAccount, DEFAULT_ACCOUNT_ID } from "@/lib/metering";
import { addEvent } from "@/lib/events";
import { createHearingPrep, getActiveHearingPrep, approveHearingPrep, type HearingPrepResult } from "@/lib/hearing-prep-service";
import type { Fixture } from "@/lib/hearing-prep";
import { extractMinuteFromPdf } from "@/lib/hearing-ingest";
import { getDocument, downloadDocument } from "@/lib/documents";

/**
 * Actions for the Hearing Prep workflow. Prepares a hearing-folder checklist from a
 * manual fixture and/or a pasted minute. Everything is a DRAFT — counsel reviews.
 */

async function loadMatter(id: string) {
  const account = await getCurrentAccount();
  const accountId = account?.id ?? DEFAULT_ACCOUNT_ID;
  const matter = await getMatter(id, accountId);
  return { account, matter };
}

export async function prepareHearingPrep(
  matterId: string,
  manual: Partial<Fixture>,
  minuteText: string,
): Promise<HearingPrepResult> {
  await requireUser();
  const { matter } = await loadMatter(matterId);
  if (!matter?.result) return { ok: false, reason: "Matter not found." };

  const res = await createHearingPrep(matter, { manual, minuteText });
  if (res.ok) {
    const miss = res.run.content.missingItems.length;
    await addEvent(
      matter.accountId,
      matter.id,
      "hearing_prep_prepared",
      `Hearing folder prepared (v${res.run.version})${miss ? ` · ${miss} folder ${miss === 1 ? "item" : "items"} still missing` : " · folder complete"}`,
    );
  }
  return res;
}

/** Prepare the hearing folder from an ATTACHED minute PDF on the matter. */
export async function prepareHearingPrepFromDocument(matterId: string, documentId: string): Promise<HearingPrepResult> {
  await requireUser();
  const { matter } = await loadMatter(matterId);
  if (!matter?.result) return { ok: false, reason: "Matter not found." };

  const doc = await getDocument(documentId);
  if (!doc || doc.matterId !== matterId) return { ok: false, reason: "Document not found on this matter." };
  if (doc.mime !== "application/pdf") return { ok: false, reason: "The minute must be a PDF — paste the text or enter the fixture instead." };

  const bytes = await downloadDocument(doc);
  if (!bytes) return { ok: false, reason: "Couldn't open that document." };

  const extract = await extractMinuteFromPdf(bytes);
  if (!extract.readable) {
    return { ok: false, reason: "Unable to read a fixture from that minute — enter the fixture manually or paste the text." };
  }

  const res = await createHearingPrep(matter, {
    parsed: { fixture: extract.fixture, directions: extract.directions, fixtureSource: extract.fixtureSource },
  });
  if (res.ok) {
    const miss = res.run.content.missingItems.length;
    await addEvent(
      matter.accountId,
      matter.id,
      "hearing_prep_prepared",
      `Hearing folder prepared from ${doc.fileName} (v${res.run.version})${miss ? ` · ${miss} folder item${miss === 1 ? "" : "s"} still missing` : ""}`,
    );
  }
  return res;
}

export async function reviewHearingPrep(matterId: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const { matter } = await loadMatter(matterId);
  if (!matter) return { ok: false };
  const run = await getActiveHearingPrep(matterId);
  if (!run) return { ok: false };
  if (run.state !== "approved") {
    await approveHearingPrep(run, user.id);
    await addEvent(matter.accountId, matter.id, "hearing_prep_reviewed", `Hearing folder v${run.version} reviewed by counsel`);
  }
  return { ok: true };
}
