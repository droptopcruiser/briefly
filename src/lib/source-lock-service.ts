import { getActiveFileOpen } from "./file-open";
import { listPacks } from "./disclosure-service";
import { getActiveHearingPrep } from "./hearing-prep-service";
import { buildSourceList, type SourcedFact, type SourceList } from "./source-lock";
import type { PipelineResult } from "./types";

/**
 * Assemble the matter's sourced-fact list from every workflow's output — the registry
 * the export gate checks against. Matter-level facts (the File Open identifiers, charge,
 * PRN and disclosure status) live on the matter's result and count even before a File
 * Open run is prepared; disclosure facts include each pack's date and every index line;
 * minute fixture + directions are minute-paragraph-level. Nothing here prepares work; it
 * only gathers what's sourced, so the gate can't false-flag a fact the file plainly holds.
 */
export async function matterSourceList(
  matterId: string,
  submission = "",
  result: PipelineResult | null = null,
): Promise<SourceList> {
  const [fileOpen, packs, hearing] = await Promise.all([
    getActiveFileOpen(matterId),
    listPacks(matterId),
    getActiveHearingPrep(matterId),
  ]);

  const facts: SourcedFact[] = [];
  const support: string[] = submission ? [submission] : [];

  // Matter-level facts — the identifiers/charge/PRN/status carried on the matter's
  // result. These exist from the moment the matter is opened, so the note's title and a
  // letter's "Re:" line are sourced whether or not a File Open run has been prepared.
  if (result) {
    for (const f of result.fields) {
      if (f.value) {
        facts.push({ value: f.value, tag: `File Open · ${f.label}`, kind: "enquiry_snippet" });
        if (f.source) support.push(f.source);
      }
    }
    if (result.summary) support.push(result.summary);
  }

  // A prepared File Open run layers its snippet-sourced values on top.
  if (fileOpen) {
    const c = fileOpen.content;
    for (const i of [...c.identifiers, ...c.charge, c.firstAppearance, c.disclosureStatus]) {
      if (i.value) {
        facts.push({ value: i.value, tag: `File Open · ${i.label}`, kind: "enquiry_snippet" });
        if (i.source) support.push(i.source);
      }
    }
  }

  // Every disclosure pack is part of the file — its date, delivery source, and index.
  for (const pack of packs) {
    if (pack.date) facts.push({ value: pack.date, tag: `Disclosure pack ${pack.packNo} date`, kind: "index_line" });
    if (pack.deliverySource) support.push(pack.deliverySource);
    for (const it of pack.items) {
      facts.push({ value: it.description, tag: `Disclosure index, item ${it.ref}`, kind: "index_line" });
      if (it.source) support.push(it.source);
    }
  }

  if (hearing) {
    const fx = hearing.content.fixture;
    if (fx.date) facts.push({ value: fx.date, tag: "Fixture date (minute)", kind: "minute_para" });
    if (fx.court) facts.push({ value: fx.court, tag: "Court (minute)", kind: "minute_para" });
    for (const d of hearing.content.directions) support.push(d);
    if (hearing.content.fixtureSource) support.push(hearing.content.fixtureSource);
  }

  return buildSourceList(facts, support);
}
