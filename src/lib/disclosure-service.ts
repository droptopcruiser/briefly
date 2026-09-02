import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";
import { matterSourceHash, type WorkBriefState } from "./work-brief";
import { buildDisclosureNote, type DisclosurePack, type DisclosureNote } from "./disclosure";
import type { Matter, PipelineResult } from "./types";

/**
 * Persistence for the Disclosure Note workflow. Disclosure PACKS (immutable snapshots
 * of each index provided) and the Disclosure NOTE (the prepared, review-gated draft)
 * both live in the shared work_briefs table — packs as kind='disclosure_pack'
 * (version = pack number), the note as kind='disclosure_note' — so no migration is
 * needed. A process-memory fallback keeps it working with no DB in dev/demo.
 */

const PACK_KIND = "disclosure_pack";
const NOTE_KIND = "disclosure_note";

// ── Packs ─────────────────────────────────────────────────────────────────────

const gp = globalThis as unknown as { __brieflyPacks?: Map<string, DisclosurePack[]> };
const packMem: Map<string, DisclosurePack[]> = (gp.__brieflyPacks ??= new Map());

/** All packs imported to a matter, oldest first. */
export async function listPacks(matterId: string): Promise<DisclosurePack[]> {
  const db = getSupabase();
  if (!db) return [...(packMem.get(matterId) ?? [])].sort((a, b) => a.packNo - b.packNo);
  const { data, error } = await db
    .from("work_briefs")
    .select("content, version")
    .eq("matter_id", matterId)
    .eq("kind", PACK_KIND)
    .order("version", { ascending: true });
  if (error) throw new Error(`listPacks: ${error.message}`);
  return (data ?? []).map((r) => r.content as DisclosurePack);
}

/** Persist a newly-imported pack (a fresh snapshot; packs are never rewritten). */
export async function savePack(matter: Matter, pack: DisclosurePack): Promise<void> {
  const db = getSupabase();
  if (!db) {
    const list = packMem.get(matter.id) ?? [];
    list.push(pack);
    packMem.set(matter.id, list);
    return;
  }
  const row = {
    id: randomUUID(),
    account_id: matter.accountId ?? "",
    matter_id: matter.id,
    version: pack.packNo,
    state: "draft" as WorkBriefState,
    content: pack,
    source_hash: "",
    readiness: 0,
    cost_cents: 0,
    mocked: false,
    created_at: new Date().toISOString(),
    approved_at: null,
    approved_by: null,
    kind: PACK_KIND,
  };
  const { error } = await db.from("work_briefs").insert(row);
  if (error) throw new Error(`savePack: ${error.message}`);
}

/** The next pack number for a matter (1-based). */
export async function nextPackNo(matterId: string): Promise<number> {
  const packs = await listPacks(matterId);
  return packs.reduce((m, p) => Math.max(m, p.packNo), 0) + 1;
}

// ── The note ──────────────────────────────────────────────────────────────────

export interface DisclosureNoteRun {
  id: string;
  accountId: string;
  matterId: string;
  version: number;
  state: WorkBriefState;
  content: DisclosureNote;
  sourceHash: string;
  costCents: number;
  mocked: boolean;
  createdAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
}

const gn = globalThis as unknown as { __brieflyDiscNotes?: Map<string, DisclosureNoteRun> };
const noteMem: Map<string, DisclosureNoteRun> = (gn.__brieflyDiscNotes ??= new Map());

interface NoteRow {
  id: string;
  account_id: string;
  matter_id: string;
  version: number;
  state: WorkBriefState;
  content: DisclosureNote;
  source_hash: string | null;
  cost_cents: number | null;
  mocked: boolean | null;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  kind: string;
}

function rowToNote(r: NoteRow): DisclosureNoteRun {
  return {
    id: r.id,
    accountId: r.account_id,
    matterId: r.matter_id,
    version: r.version,
    state: r.state,
    content: r.content,
    sourceHash: r.source_hash ?? "",
    costCents: r.cost_cents ?? 0,
    mocked: r.mocked ?? false,
    createdAt: r.created_at,
    approvedAt: r.approved_at,
    approvedBy: r.approved_by,
  };
}

async function saveNote(run: DisclosureNoteRun): Promise<void> {
  const db = getSupabase();
  if (!db) {
    noteMem.set(run.id, run);
    return;
  }
  const row: NoteRow = {
    id: run.id,
    account_id: run.accountId,
    matter_id: run.matterId,
    version: run.version,
    state: run.state,
    content: run.content,
    source_hash: run.sourceHash,
    cost_cents: run.costCents,
    mocked: run.mocked,
    created_at: run.createdAt,
    approved_at: run.approvedAt,
    approved_by: run.approvedBy,
    kind: NOTE_KIND,
  };
  const { error } = await db.from("work_briefs").upsert(row);
  if (error) throw new Error(`saveNote: ${error.message}`);
}

export async function getLatestDisclosureNote(matterId: string): Promise<DisclosureNoteRun | null> {
  const db = getSupabase();
  if (!db) {
    return (
      [...noteMem.values()].filter((r) => r.matterId === matterId).sort((a, b) => b.version - a.version)[0] ?? null
    );
  }
  const { data, error } = await db
    .from("work_briefs")
    .select("*")
    .eq("matter_id", matterId)
    .eq("kind", NOTE_KIND)
    .order("version", { ascending: false })
    .limit(1);
  if (error) throw new Error(`getLatestDisclosureNote: ${error.message}`);
  return data?.[0] ? rowToNote(data[0] as NoteRow) : null;
}

export async function getActiveDisclosureNote(matterId: string): Promise<DisclosureNoteRun | null> {
  const latest = await getLatestDisclosureNote(matterId);
  return latest && latest.state !== "superseded" ? latest : null;
}

/**
 * Prepare the Disclosure Note from the matter's packs (latest diffed against the
 * previous), persisted as a draft. Supersedes the prior note, preserving history.
 * Returns null when there are no packs yet (nothing to compare).
 */
export async function createDisclosureNote(matter: Matter): Promise<DisclosureNoteRun | null> {
  if (!matter.result) return null;
  const packs = await listPacks(matter.id);
  if (packs.length === 0) return null;

  const latest = await getLatestDisclosureNote(matter.id);
  if (latest && latest.state !== "superseded") {
    latest.state = "superseded";
    await saveNote(latest);
  }

  const content = buildDisclosureNote(matter.result as PipelineResult, packs);
  const run: DisclosureNoteRun = {
    id: randomUUID(),
    accountId: matter.accountId ?? "",
    matterId: matter.id,
    version: (latest?.version ?? 0) + 1,
    state: "draft",
    content,
    sourceHash: matterSourceHash(matter),
    costCents: 0,
    mocked: false,
    createdAt: new Date().toISOString(),
    approvedAt: null,
    approvedBy: null,
  };
  await saveNote(run);
  return run;
}

/** Mark the note reviewed by counsel. Records who/when. Sends nothing. */
export async function approveDisclosureNote(run: DisclosureNoteRun, approverUserId: string | null): Promise<void> {
  run.state = "approved";
  run.approvedAt = new Date().toISOString();
  run.approvedBy = approverUserId;
  await saveNote(run);
}
