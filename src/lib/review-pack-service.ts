import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";
import { matterSourceHash, type WorkBriefState } from "./work-brief";
import type { ReviewPack } from "./review-pack";
import type { Matter } from "./types";

/**
 * Persistence for the Counsel Review Pack. Stored in the shared work_briefs table
 * with kind='review_pack' (content = the orientation snapshot), migration-free. The
 * pack is assembled deterministically in the action from existing prepared work; this
 * only versions and persists it. Only ever a snapshot for review — never sent.
 */

export interface ReviewPackRun {
  id: string;
  accountId: string;
  matterId: string;
  version: number;
  state: WorkBriefState;
  content: ReviewPack;
  sourceHash: string;
  createdAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
}

const KIND = "review_pack";

const gs = globalThis as unknown as { __brieflyReviewPack?: Map<string, ReviewPackRun> };
const memory: Map<string, ReviewPackRun> = (gs.__brieflyReviewPack ??= new Map());

interface Row {
  id: string;
  account_id: string;
  matter_id: string;
  version: number;
  state: WorkBriefState;
  content: ReviewPack;
  source_hash: string | null;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  kind: string;
}

function rowToRun(r: Row): ReviewPackRun {
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

async function save(run: ReviewPackRun): Promise<void> {
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
  if (error) throw new Error(`save(review_pack): ${error.message}`);
}

export async function getLatestReviewPack(matterId: string): Promise<ReviewPackRun | null> {
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
  if (error) throw new Error(`getLatestReviewPack: ${error.message}`);
  return data?.[0] ? rowToRun(data[0] as Row) : null;
}

export async function getActiveReviewPack(matterId: string): Promise<ReviewPackRun | null> {
  const latest = await getLatestReviewPack(matterId);
  return latest && latest.state !== "superseded" ? latest : null;
}

/** Persist a freshly-assembled pack (superseding the prior one, preserving history). */
export async function saveReviewPack(matter: Matter, content: ReviewPack): Promise<ReviewPackRun> {
  const latest = await getLatestReviewPack(matter.id);
  if (latest && latest.state !== "superseded") {
    latest.state = "superseded";
    await save(latest);
  }
  const run: ReviewPackRun = {
    id: randomUUID(),
    accountId: matter.accountId ?? "",
    matterId: matter.id,
    version: (latest?.version ?? 0) + 1,
    state: "draft",
    content,
    sourceHash: matterSourceHash(matter),
    createdAt: new Date().toISOString(),
    approvedAt: null,
    approvedBy: null,
  };
  await save(run);
  return run;
}

export async function approveReviewPack(run: ReviewPackRun, approverUserId: string | null): Promise<void> {
  run.state = "approved";
  run.approvedAt = new Date().toISOString();
  run.approvedBy = approverUserId;
  await save(run);
}
