import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";
import type { Matter, Rubric } from "./types";

/**
 * "Since the last review" — a deterministic, evidence-backed diff of a matter
 * against a stored review baseline.
 *
 * This is NOT a freeform AI summary of the thread. A review baseline is a real,
 * stored snapshot (matter_reviews) taken at a genuine review event — approving &
 * sending a follow-up, approving an Initial Work Brief, marking a matter
 * complete, or an explicit "Mark reviewed". The diff is then a data-level
 * comparison of the matter's current extracted facts / documents / gaps /
 * readiness / message count against that snapshot, so every change is traceable
 * back to the incoming email or changed rubric result.
 *
 * v1 is matter-level (the latest baseline for the matter, labelled "the last
 * review" — never "your last review"). `reviewedBy` is already stored so we can
 * move to per-professional cursors later without a migration.
 */

/** The trimmed matter state captured at a review, enough to diff against later. */
export interface ReviewSnapshot {
  readiness: number;
  fields: { key: string; label: string; value: string | null; present: boolean; source: string | null }[];
  documentsPresent: string[];
  gaps: { key: string; label: string; kind: "field" | "document" }[];
  /** Number of client replies folded into the submission at snapshot time. */
  replyCount: number;
}

export interface MatterReview {
  id: string;
  accountId: string;
  matterId: string;
  reviewedBy: string | null;
  snapshot: ReviewSnapshot;
  createdAt: string;
}

/** One fact newly present since the baseline. */
export interface NewFact {
  label: string;
  value: string;
  source: string | null;
  carried?: boolean;
}
/** One fact whose value changed since the baseline. */
export interface ChangedFact {
  label: string;
  oldValue: string;
  newValue: string;
  source: string | null;
}

export interface MatterChanges {
  newFacts: NewFact[];
  changedFacts: ChangedFact[];
  resolved: { label: string; kind: "field" | "document" }[];
  stillOutstanding: { label: string; kind: "field" | "document" }[];
  newDocuments: { label: string }[];
  newMessages: number;
  readinessDelta: { from: number; to: number } | null;
  /** True when anything materially changed (outstanding-only doesn't count). */
  hasChanges: boolean;
}

function replyCount(submission: string): number {
  return (submission.match(/--- Client reply/g) ?? []).length;
}

/** Capture the current matter state as a review baseline snapshot. */
export function buildSnapshot(matter: Matter): ReviewSnapshot {
  const r = matter.result;
  return {
    readiness: r?.readiness ?? 0,
    fields: (r?.fields ?? []).map((f) => ({
      key: f.key,
      label: f.label,
      value: f.value,
      present: f.present,
      source: f.source,
    })),
    documentsPresent: [...(r?.documentsPresent ?? [])],
    gaps: (r?.gaps ?? []).map((g) => ({ key: g.key, label: g.label, kind: g.kind })),
    replyCount: replyCount(matter.submission ?? ""),
  };
}

/**
 * Deterministic diff of the matter's current state against a baseline snapshot.
 * Pure data comparison — no model inference. `rubric` only supplies document
 * labels for newly-received documents.
 */
export function computeMatterChanges(
  matter: Matter,
  snapshot: ReviewSnapshot,
  rubric?: Rubric,
): MatterChanges {
  const r = matter.result;
  const curFields = r?.fields ?? [];
  const baseByKey = new Map(snapshot.fields.map((f) => [f.key, f]));

  const newFacts: NewFact[] = [];
  const changedFacts: ChangedFact[] = [];
  for (const f of curFields) {
    if (!f.present || !f.value) continue;
    const b = baseByKey.get(f.key);
    if (!b || !b.present) {
      newFacts.push({ label: f.label, value: f.value, source: f.source, carried: f.carried });
    } else if ((b.value ?? "") !== f.value) {
      changedFacts.push({
        label: f.label,
        oldValue: b.value ?? "—",
        newValue: f.value,
        source: f.source,
      });
    }
  }

  const curGaps = r?.gaps ?? [];
  const curGapKeys = new Set(curGaps.map((g) => g.key));
  const resolved = snapshot.gaps
    .filter((g) => !curGapKeys.has(g.key))
    .map((g) => ({ label: g.label, kind: g.kind }));
  const stillOutstanding = curGaps.map((g) => ({ label: g.label, kind: g.kind }));

  const docLabel = new Map((rubric?.documents ?? []).map((d) => [d.key, d.label]));
  const baseDocs = new Set(snapshot.documentsPresent);
  const newDocuments = (r?.documentsPresent ?? [])
    .filter((k) => !baseDocs.has(k))
    .map((k) => ({ label: docLabel.get(k) ?? k }));

  const newMessages = Math.max(0, replyCount(matter.submission ?? "") - snapshot.replyCount);

  const curReadiness = r?.readiness ?? 0;
  const readinessDelta =
    snapshot.readiness !== curReadiness ? { from: snapshot.readiness, to: curReadiness } : null;

  const hasChanges =
    newFacts.length > 0 ||
    changedFacts.length > 0 ||
    resolved.length > 0 ||
    newDocuments.length > 0 ||
    newMessages > 0;

  return {
    newFacts,
    changedFacts,
    resolved,
    stillOutstanding,
    newDocuments,
    newMessages,
    readinessDelta,
    hasChanges,
  };
}

// --- Persistence (Supabase when configured; process-memory fallback) --------

const globalStore = globalThis as unknown as { __brieflyReviews?: Map<string, MatterReview> };
const memory: Map<string, MatterReview> = (globalStore.__brieflyReviews ??= new Map());

interface ReviewRow {
  id: string;
  account_id: string;
  matter_id: string;
  reviewed_by: string | null;
  snapshot: ReviewSnapshot;
  created_at: string;
}

function rowToReview(r: ReviewRow): MatterReview {
  return {
    id: r.id,
    accountId: r.account_id,
    matterId: r.matter_id,
    reviewedBy: r.reviewed_by,
    snapshot: r.snapshot,
    createdAt: r.created_at,
  };
}

/** The current review baseline for a matter — the most recent one recorded. */
export async function getBaselineReview(matterId: string): Promise<MatterReview | null> {
  const db = getSupabase();
  if (!db) {
    return (
      [...memory.values()]
        .filter((r) => r.matterId === matterId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
    );
  }
  const { data, error } = await db
    .from("matter_reviews")
    .select("*")
    .eq("matter_id", matterId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`getBaselineReview: ${error.message}`);
  return data?.[0] ? rowToReview(data[0] as ReviewRow) : null;
}

/**
 * Record a review baseline for the matter's current state. Called from the
 * genuine review events (approve & send, approve brief, mark complete, explicit
 * mark reviewed). Best-effort — never breaks the surrounding action.
 */
export async function recordReview(matter: Matter, reviewedBy: string | null): Promise<void> {
  const review: MatterReview = {
    id: randomUUID(),
    accountId: matter.accountId ?? "",
    matterId: matter.id,
    reviewedBy,
    snapshot: buildSnapshot(matter),
    createdAt: new Date().toISOString(),
  };
  const db = getSupabase();
  if (!db) {
    memory.set(review.id, review);
    return;
  }
  try {
    await db.from("matter_reviews").insert({
      id: review.id,
      account_id: review.accountId,
      matter_id: review.matterId,
      reviewed_by: review.reviewedBy,
      snapshot: review.snapshot,
      created_at: review.createdAt,
    });
  } catch (err) {
    console.error("recordReview failed:", err);
  }
}
