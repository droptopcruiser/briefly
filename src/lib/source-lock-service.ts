import { getActiveFileOpen } from "./file-open";
import { listPacks } from "./disclosure-service";
import { getActiveHearingPrep } from "./hearing-prep-service";
import { buildSourceList, type SourcedFact, type SourceList } from "./source-lock";

/**
 * Assemble the matter's sourced-fact list from every workflow's output — the registry
 * the export gate checks against. File Open facts are snippet-level (their source is
 * the enquiry); disclosure items are index-line/page-level; minute fixture + directions
 * are minute-paragraph-level. Nothing here prepares work; it only gathers what's sourced.
 */
export async function matterSourceList(matterId: string, submission = ""): Promise<SourceList> {
  const [fileOpen, packs, hearing] = await Promise.all([
    getActiveFileOpen(matterId),
    listPacks(matterId),
    getActiveHearingPrep(matterId),
  ]);

  const facts: SourcedFact[] = [];
  const support: string[] = submission ? [submission] : [];

  if (fileOpen) {
    const c = fileOpen.content;
    for (const i of [...c.identifiers, ...c.charge, c.firstAppearance, c.disclosureStatus]) {
      if (i.value) {
        facts.push({ value: i.value, tag: `File Open · ${i.label}`, kind: "enquiry_snippet" });
        if (i.source) support.push(i.source);
      }
    }
  }

  const latest = packs.length ? packs[packs.length - 1] : null;
  if (latest) {
    for (const it of latest.items) {
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
