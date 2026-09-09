/**
 * The Hearing Prep workflow's SAFETY-CRITICAL core — pure and client-safe.
 *
 * From a fixture (or an attached minute) plus the matter's material, Briefly prepares
 * a one-page hearing-folder checklist: the fixture, custody/bail, what the folder
 * needs, what's actually missing, and the non-legal same-day admin jobs.
 *
 * HARD RULES (enforced here):
 *  - Never runs without a fixture OR a minute.
 *  - NO plea advice, argument, sentence range, or case strategy — the output is
 *    strictly logistical (folder readiness + administrative jobs).
 *  - Invents no court detail: a fixture field that isn't given stays a bracketed gap,
 *    and directions are taken verbatim from the minute, never manufactured.
 *  - Everything is a DRAFT for counsel to review.
 */

export const HEARING_PREP_VERSION = "hearing-prep/1";

export type HearingType =
  | "first_appearance"
  | "callover"
  | "case_review"
  | "sentencing"
  | "trial"
  | "hearing";

export interface Fixture {
  date: string | null;
  time: string | null;
  court: string | null;
  type: HearingType | null;
  custody: "bail" | "remand" | null;
}

export interface FolderItem {
  item: string;
  present: boolean;
}

export interface HearingPrepNote {
  workflowVersion: string;
  fixture: Fixture;
  fromMinute: boolean;
  /** The verbatim minute quote (and page, where available) the fixture was read from. */
  fixtureSource: string | null;
  /** Directions read verbatim from the minute — never invented. */
  directions: string[];
  custodyLine: string;
  folderContents: FolderItem[];
  missingItems: string[];
  /** Non-legal same-day admin jobs. */
  adminJobs: string[];
}

// ── Hard stop ─────────────────────────────────────────────────────────────────

export interface HearingGate {
  ok: boolean;
  reason: string | null;
}

export function hearingGate(hasFixture: boolean, hasMinute: boolean): HearingGate {
  if (hasFixture || hasMinute) return { ok: true, reason: null };
  return { ok: false, reason: "Add a fixture (date and court) or attach a minute to prepare the hearing folder." };
}

// ── Minute parsing (deterministic; grounded) ──────────────────────────────────

const TYPE_WORDS: [RegExp, HearingType][] = [
  [/first appearance/i, "first_appearance"],
  [/callover|call-over|list check/i, "callover"],
  [/case review|cmm|case management/i, "case_review"],
  [/sentenc/i, "sentencing"],
  [/trial|defended hearing|jury/i, "trial"],
];

const DATE_RE =
  /\b(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/i;
const TIME_RE = /\b(\d{1,2}(?::\d{2})?\s?(?:a\.?m\.?|p\.?m\.?))\b/i;
const COURT_RE = /\b((?:[A-Z][a-z]+\s+){1,3}(?:District|High|Youth)\s+Court)\b/;
const DIRECTION_RE = /\b(is to|are to|to be|by \d|counsel (?:to|is)|disclosure|adjourn|remand|bail|next (?:call|event|appearance)|leave)\b/i;

/** Pull a fixture + verbatim directions from a court minute. Nothing is invented:
 *  a detail the minute doesn't state stays null. */
export function parseMinute(text: string): { fixture: Fixture; directions: string[] } {
  const type = TYPE_WORDS.find(([re]) => re.test(text))?.[1] ?? null;
  // "remanded on bail" means bail; only "in custody" (or a custodial remand) is
  // custody. A bare "remanded" with no qualifier stays null, not a guess.
  const custody: Fixture["custody"] = /in custody|custodial|remanded? in custody/i.test(text)
    ? "remand"
    : /\bbail\b/i.test(text)
      ? "bail"
      : null;
  const fixture: Fixture = {
    date: text.match(DATE_RE)?.[1] ?? null,
    time: text.match(TIME_RE)?.[1] ?? null,
    court: text.match(COURT_RE)?.[1] ?? null,
    type,
    custody,
  };
  const directions = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 8 && DIRECTION_RE.test(l))
    .slice(0, 8);
  return { fixture, directions };
}

// ── Build the checklist (deterministic; logistical only) ──────────────────────

/** The standard hearing-folder contents, and how each is satisfied by the matter. */
const FOLDER: { item: string; has: (s: { docs: Set<string>; packs: number; minute: boolean }) => boolean }[] = [
  { item: "Charging document", has: (s) => s.docs.has("charging_document") },
  { item: "Summary of Facts", has: (s) => s.docs.has("sof") },
  { item: "Latest disclosure index", has: (s) => s.packs > 0 },
  { item: "Court minute", has: (s) => s.minute },
  { item: "Witness statements", has: (s) => s.docs.has("statements") },
  { item: "Exhibit list", has: (s) => s.docs.has("exhibit_list") },
];

function fixtureLine(f: Fixture): string {
  const date = f.date ?? "[date not stated]";
  const time = f.time ? ` at ${f.time}` : "";
  const court = f.court ?? "[court not stated]";
  return `${date}${time}, ${court}`;
}

export interface HearingPrepInput {
  fixture: Fixture;
  directions: string[];
  minuteProvided: boolean;
  documentsPresent: string[];
  packCount: number;
  fixtureSource?: string | null;
}

export function buildHearingPrep(input: HearingPrepInput): HearingPrepNote {
  const state = { docs: new Set(input.documentsPresent), packs: input.packCount, minute: input.minuteProvided };
  const folderContents: FolderItem[] = FOLDER.map((f) => ({ item: f.item, present: f.has(state) }));
  const missingItems = folderContents.filter((f) => !f.present).map((f) => f.item);

  const custodyLine =
    input.fixture.custody === "remand"
      ? "In custody — remand (arrange production for the fixture)"
      : input.fixture.custody === "bail"
        ? "On bail (confirm the defendant's attendance and any conditions)"
        : "[custody / bail status not stated]";

  // Same-day admin jobs — strictly logistical. No plea, argument, or sentence content.
  const adminJobs: string[] = [
    "Assemble and print the hearing folder (index, charge, SOF, latest disclosure, minute).",
    `Diarise the fixture — ${fixtureLine(input.fixture)}.`,
    input.fixture.custody === "remand"
      ? "Arrange the defendant's production from custody for the fixture."
      : "Confirm the defendant's attendance and any bail conditions.",
    "Confirm who is appearing (and brief covering counsel if there is a clash).",
  ];
  if (input.fixture.type === "trial") {
    adminJobs.push("Confirm witness availability and whether an interpreter is required.");
  }
  if (missingItems.length) {
    adminJobs.push(`Chase the missing folder items before the fixture: ${missingItems.join(", ")}.`);
  }

  return {
    workflowVersion: HEARING_PREP_VERSION,
    fixture: input.fixture,
    fromMinute: input.minuteProvided,
    fixtureSource: input.fixtureSource ?? null,
    directions: input.directions,
    custodyLine,
    folderContents,
    missingItems,
    adminJobs,
  };
}
