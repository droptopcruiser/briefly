"use server";

import { requireUser } from "@/lib/auth";
import { getMatter } from "@/lib/store";
import { getCurrentAccount, DEFAULT_ACCOUNT_ID } from "@/lib/metering";
import { addEvent, listEvents } from "@/lib/events";
import { buildReviewPack, type PackItem } from "@/lib/review-pack";
import { saveReviewPack, getActiveReviewPack, approveReviewPack, type ReviewPackRun } from "@/lib/review-pack-service";
import { getActiveFileOpen } from "@/lib/file-open";
import { getActiveDisclosureNote, listPacks } from "@/lib/disclosure-service";
import { getActiveHearingPrep } from "@/lib/hearing-prep-service";
import { getActiveCorrespondence } from "@/lib/correspondence-service";
import type { PipelineResult } from "@/lib/types";

/**
 * Assemble the Counsel Review Pack from the matter's existing prepared work. Reads
 * only; prepares nothing new and gives no advice. Returns the persisted snapshot.
 */

const TYPE_LABEL: Record<string, string> = {
  first_appearance: "First appearance", callover: "Callover", case_review: "Case review",
  sentencing: "Sentencing", trial: "Trial / defended hearing", hearing: "Hearing",
};

async function loadMatter(id: string) {
  const account = await getCurrentAccount();
  const accountId = account?.id ?? DEFAULT_ACCOUNT_ID;
  return { account, matter: await getMatter(id, accountId) };
}

export type ReviewPackResult = { ok: true; run: ReviewPackRun } | { ok: false; reason: string };

export async function prepareReviewPack(matterId: string): Promise<ReviewPackResult> {
  await requireUser();
  const { matter } = await loadMatter(matterId);
  if (!matter?.result) return { ok: false, reason: "Matter not found." };
  const r = matter.result as PipelineResult;

  const [fileOpen, discNote, packs, hearing, corr, events] = await Promise.all([
    getActiveFileOpen(matterId),
    getActiveDisclosureNote(matterId),
    listPacks(matterId),
    getActiveHearingPrep(matterId),
    getActiveCorrespondence(matterId),
    listEvents(matterId),
  ]);

  const item = (key: string, label: string): PackItem => {
    const f = r.fields.find((x) => x.key === key);
    return { label, value: f && f.present && f.value ? f.value : null, source: f?.source ?? null };
  };

  const docs = new Set(r.documentsPresent);
  const latestPack = packs.length ? packs[packs.length - 1] : null;
  const fx = hearing?.content.fixture ?? null;
  const fixtureLine = fx
    ? `${fx.date ?? "[date not stated]"}${fx.time ? ` at ${fx.time}` : ""}, ${fx.court ?? "[court not stated]"}`
    : null;

  // Unresolved gaps — missing initial-disclosure items + missing hearing-folder items.
  const gaps = new Set<string>();
  if (discNote) for (const c of discNote.content.initialDisclosureChecklist) if (!c.present) gaps.add(c.item);
  if (hearing) for (const m of hearing.content.missingItems) gaps.add(m);

  const preparedDrafts: { label: string; state: string }[] = [];
  if (fileOpen) preparedDrafts.push({ label: "File Open note", state: fileOpen.state });
  if (discNote) preparedDrafts.push({ label: "Disclosure note", state: discNote.state });
  if (corr) preparedDrafts.push({ label: "Correspondence draft", state: corr.state });
  if (hearing) preparedDrafts.push({ label: "Hearing folder", state: hearing.state });

  const changed = [...events]
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
    .filter((e) => e.detail && !e.type.endsWith("_reviewed"))
    .slice(0, 5)
    .map((e) => e.detail as string);

  const pack = buildReviewPack({
    defendant: item("defendant", "Defendant"),
    charge: item("charge", "Charge"),
    court: item("court", "Court"),
    prn: item("prn", "PRN"),
    chargeDocPresent: docs.has("charging_document"),
    sofPresent: docs.has("sof"),
    fixtureLine,
    hearingTypeLabel: fx?.type ? TYPE_LABEL[fx.type] ?? null : null,
    directions: hearing?.content.directions ?? [],
    latestPackLine: latestPack ? `Pack ${latestPack.packNo}${latestPack.date ? ` · ${latestPack.date}` : ""} · ${latestPack.items.length} items` : null,
    deliverySource: latestPack?.deliverySource ?? null,
    disclosureAsks: discNote?.content.asks.map((a) => a.text) ?? [],
    unresolvedGaps: [...gaps],
    preparedDrafts,
    changed,
  });

  const run = await saveReviewPack(matter, pack);
  await addEvent(matter.accountId, matter.id, "review_pack_prepared", `Counsel review pack prepared (v${run.version})`);
  return { ok: true, run };
}

export async function reviewReviewPack(matterId: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const { matter } = await loadMatter(matterId);
  if (!matter) return { ok: false };
  const run = await getActiveReviewPack(matterId);
  if (!run) return { ok: false };
  if (run.state !== "approved") {
    await approveReviewPack(run, user.id);
    await addEvent(matter.accountId, matter.id, "review_pack_reviewed", `Counsel review pack v${run.version} reviewed`);
  }
  return { ok: true };
}
