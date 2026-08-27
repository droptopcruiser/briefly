import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";
import { listMatters } from "./store";
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

/** Latest review snapshot per matter for an account (one query; memory fallback). */
async function latestBaselines(accountId: string): Promise<Map<string, ReviewSnapshot>> {
  const latest = new Map<string, ReviewSnapshot>();
  const db = getSupabase();
  if (!db) {
    for (const r of [...memory.values()]
      .filter((r) => r.accountId === accountId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
      if (!latest.has(r.matterId)) latest.set(r.matterId, r.snapshot);
    }
    return latest;
  }
  const { data, error } = await db
    .from("matter_reviews")
    .select("matter_id,snapshot,created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`latestBaselines: ${error.message}`);
  for (const r of (data ?? []) as { matter_id: string; snapshot: ReviewSnapshot }[]) {
    if (!latest.has(r.matter_id)) latest.set(r.matter_id, r.snapshot);
  }
  return latest;
}

export interface RollupItem {
  matter: Matter;
  changes: MatterChanges;
}

/**
 * The managerial "what changed since your last review?" overview: active matters
 * that have moved on since their stored baseline. Two queries (baselines +
 * matters) plus an in-memory diff — no per-matter round trips.
 */
export async function getReviewRollup(
  accountId: string,
  limit = 6,
): Promise<{ items: RollupItem[]; total: number }> {
  const baselines = await latestBaselines(accountId);
  if (baselines.size === 0) return { items: [], total: 0 };

  const matters = await listMatters(accountId, { limit: 100 });
  const items: RollupItem[] = [];
  for (const m of matters) {
    if (m.status === "completed") continue;
    const snap = baselines.get(m.id);
    if (!snap) continue;
    const changes = computeMatterChanges(m, snap);
    if (changes.hasChanges) items.push({ matter: m, changes });
  }
  return { items: items.slice(0, limit), total: items.length };
}

/**
 * Changes-since-baseline for a whole set of matters, in ONE query (the account's
 * latest baselines) + an in-memory diff — no per-matter round trips. Matters with
 * no recorded baseline are simply absent from the map (nothing to diff against).
 * Feeds the Needs Attention urgency scorer.
 */
export async function getChangesMap(
  accountId: string,
  matters: Matter[],
): Promise<Map<string, MatterChanges>> {
  const map = new Map<string, MatterChanges>();
  const baselines = await latestBaselines(accountId);
  if (baselines.size === 0) return map;
  for (const m of matters) {
    const snap = baselines.get(m.id);
    if (snap) map.set(m.id, computeMatterChanges(m, snap));
  }
  return map;
}

/** Compact one-line summary of a matter's changes (for the dashboard rollup). */
export function summariseChanges(c: MatterChanges): string {
  const seg: string[] = [];
  if (c.newMessages > 0) seg.push(`${c.newMessages} new ${c.newMessages === 1 ? "reply" : "replies"}`);
  if (c.newFacts.length) seg.push(`${c.newFacts.length} new ${c.newFacts.length === 1 ? "fact" : "facts"}`);
  if (c.changedFacts.length) seg.push(`${c.changedFacts.length} changed`);
  if (c.newDocuments.length) seg.push(`${c.newDocuments.length} ${c.newDocuments.length === 1 ? "document" : "documents"}`);
  if (c.resolved.length) seg.push(`${c.resolved.length} resolved`);
  return seg.join(" · ") || "updated";
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
