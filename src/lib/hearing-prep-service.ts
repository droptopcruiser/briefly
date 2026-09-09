import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";
import { matterSourceHash, type WorkBriefState } from "./work-brief";
import { hearingGate, parseMinute, buildHearingPrep, type Fixture, type HearingPrepNote } from "./hearing-prep";
import { listPacks } from "./disclosure-service";
import type { Matter, PipelineResult } from "./types";

/**
 * Persistence for the Hearing Prep workflow. Stored in the shared work_briefs table
 * with kind='hearing_prep' (content = the checklist), migration-free. The checklist
 * itself is built deterministically in the pure ./hearing-prep module — no model call,
 * because it's strictly logistical (folder readiness + admin), and staying deterministic
 * keeps it safe and grounded. Only ever a DRAFT — counsel reviews.
 */

export interface HearingPrepRun {
  id: string;
  accountId: string;
  matterId: string;
  version: number;
  state: WorkBriefState;
  content: HearingPrepNote;
  sourceHash: string;
  createdAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
}

const KIND = "hearing_prep";

const gs = globalThis as unknown as { __brieflyHearing?: Map<string, HearingPrepRun> };
const memory: Map<string, HearingPrepRun> = (gs.__brieflyHearing ??= new Map());

interface Row {
  id: string;
  account_id: string;
  matter_id: string;
  version: number;
  state: WorkBriefState;
  content: HearingPrepNote;
  source_hash: string | null;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  kind: string;
}

function rowToRun(r: Row): HearingPrepRun {
  return {
    id: r.id,
    accountId: r.account_id,
    matterId: r.matter_id,
    version: r.version,
    state: r.state,
    content: r.content,
    sourceHash: r.source_hash ?? "",
    createdAt: r.created_at,
    approvedAt: r.approved_at,
    approvedBy: r.approved_by,
  };
}

async function saveRun(run: HearingPrepRun): Promise<void> {
  const db = getSupabase();
  if (!db) {
    memory.set(run.id, run);
    return;
  }
  const row: Row = {
    id: run.id,
    account_id: run.accountId,
    matter_id: run.matterId,
    version: run.version,
    state: run.state,
    content: run.content,
    source_hash: run.sourceHash,
    created_at: run.createdAt,
    approved_at: run.approvedAt,
    approved_by: run.approvedBy,
    kind: KIND,
  };
  const { error } = await db.from("work_briefs").upsert(row);
  if (error) throw new Error(`saveRun(hearing_prep): ${error.message}`);
}

export async function getLatestHearingPrep(matterId: string): Promise<HearingPrepRun | null> {
  const db = getSupabase();
  if (!db) {
    return [...memory.values()].filter((r) => r.matterId === matterId).sort((a, b) => b.version - a.version)[0] ?? null;
  }
  const { data, error } = await db
    .from("work_briefs")
    .select("*")
    .eq("matter_id", matterId)
    .eq("kind", KIND)
    .order("version", { ascending: false })
    .limit(1);
  if (error) throw new Error(`getLatestHearingPrep: ${error.message}`);
  return data?.[0] ? rowToRun(data[0] as Row) : null;
}

export async function getActiveHearingPrep(matterId: string): Promise<HearingPrepRun | null> {
  const latest = await getLatestHearingPrep(matterId);
  return latest && latest.state !== "superseded" ? latest : null;
}

export type HearingPrepResult = { ok: true; run: HearingPrepRun } | { ok: false; reason: string };

/**
 * Prepare the hearing folder checklist from a manual fixture and/or a pasted minute.
 * Enforces the hard stop (needs a fixture or a minute). Manual fields take precedence
 * over anything parsed from the minute. Supersedes the prior run, preserving history.
 */
export async function createHearingPrep(
  matter: Matter,
  opts: {
    manual?: Partial<Fixture>;
    minuteText?: string;
    /** A minute already parsed elsewhere (e.g. read from an attached PDF). */
    parsed?: { fixture: Fixture; directions: string[]; fixtureSource?: string | null };
  },
): Promise<HearingPrepResult> {
  if (!matter.result) return { ok: false, reason: "Matter not found." };
  const manual = opts.manual ?? {};
  const minuteText = (opts.minuteText ?? "").trim();
  const parsed = opts.parsed ?? (minuteText ? parseMinute(minuteText) : { fixture: { date: null, time: null, court: null, type: null, custody: null } as Fixture, directions: [] });
  const minuteProvided = !!opts.parsed || !!minuteText;

  const fixture: Fixture = {
    date: manual.date || parsed.fixture.date,
    time: manual.time || parsed.fixture.time,
    court: manual.court || parsed.fixture.court,
    type: manual.type || parsed.fixture.type,
    custody: manual.custody || parsed.fixture.custody,
  };

  const hasFixture = !!(fixture.date || fixture.court);
  const gate = hearingGate(hasFixture, minuteProvided);
  if (!gate.ok) return { ok: false, reason: gate.reason ?? "Not enough to prepare a hearing folder." };

  const packs = await listPacks(matter.id);
  const note = buildHearingPrep({
    fixture,
    directions: parsed.directions,
    minuteProvided,
    documentsPresent: (matter.result as PipelineResult).documentsPresent,
    packCount: packs.length,
    fixtureSource: opts.parsed?.fixtureSource ?? null,
  });

  const latest = await getLatestHearingPrep(matter.id);
  if (latest && latest.state !== "superseded") {
    latest.state = "superseded";
    await saveRun(latest);
  }

  const run: HearingPrepRun = {
    id: randomUUID(),
    accountId: matter.accountId ?? "",
    matterId: matter.id,
    version: (latest?.version ?? 0) + 1,
    state: "draft",
    content: note,
    sourceHash: matterSourceHash(matter),
    createdAt: new Date().toISOString(),
    approvedAt: null,
    approvedBy: null,
  };
  await saveRun(run);
  return { ok: true, run };
}

/** Mark the hearing folder reviewed by counsel. Records who/when. Sends nothing. */
export async function approveHearingPrep(run: HearingPrepRun, approverUserId: string | null): Promise<void> {
  run.state = "approved";
  run.approvedAt = new Date().toISOString();
  run.approvedBy = approverUserId;
  await saveRun(run);
}
