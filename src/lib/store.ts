import { getSupabase } from "./supabase";
import type { Matter, PipelineResult, MatterStatus } from "./types";

/**
 * Matter persistence. Uses Supabase when configured; otherwise falls back to an
 * in-process store so the core loop is demoable without a database. The
 * in-memory store lives for the lifetime of the server process (fine for dev,
 * lost on restart).
 */

// Next.js can load a module in more than one bundler layer (server actions vs
// RSC render), giving each its own module scope. Hang the fallback store on
// globalThis so all layers share one Map within the process.
const globalStore = globalThis as unknown as { __brieflyMatters?: Map<string, Matter> };
const memory: Map<string, Matter> = (globalStore.__brieflyMatters ??= new Map());

interface MatterRow {
  id: string;
  created_at: string;
  account_id: string | null;
  client_name: string | null;
  client_email: string | null;
  submission: string;
  result: PipelineResult | null;
  status: MatterStatus;
  approved_at: string | null;
}

function rowToMatter(r: MatterRow): Matter {
  return {
    id: r.id,
    createdAt: r.created_at,
    accountId: r.account_id,
    clientName: r.client_name,
    clientEmail: r.client_email,
    submission: r.submission,
    result: r.result,
    status: r.status,
    approvedAt: r.approved_at,
  };
}

function matterToRow(m: Matter): MatterRow {
  return {
    id: m.id,
    created_at: m.createdAt,
    account_id: m.accountId,
    client_name: m.clientName,
    client_email: m.clientEmail,
    submission: m.submission,
    result: m.result,
    status: m.status,
    approved_at: m.approvedAt,
  };
}

export async function saveMatter(m: Matter): Promise<void> {
  const db = getSupabase();
  if (!db) {
    memory.set(m.id, m);
    return;
  }
  const { error } = await db.from("matters").upsert(matterToRow(m));
  if (error) throw new Error(`saveMatter: ${error.message}`);
}

/**
 * Fetch a matter, scoped to its owning account. Returns null when the id doesn't
 * exist OR belongs to a different account — the tenant-isolation guard for the
 * matter view.
 */
export async function getMatter(id: string, accountId: string): Promise<Matter | null> {
  const db = getSupabase();
  if (!db) {
    const m = memory.get(id);
    return m && m.accountId === accountId ? m : null;
  }

  const { data, error } = await db
    .from("matters")
    .select("*")
    .eq("id", id)
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw new Error(`getMatter: ${error.message}`);
  return data ? rowToMatter(data as MatterRow) : null;
}

/** List an account's matters, most recent first. */
export async function listMatters(accountId: string, limit = 50): Promise<Matter[]> {
  const db = getSupabase();
  if (!db) {
    return [...memory.values()]
      .filter((m) => m.accountId === accountId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  const { data, error } = await db
    .from("matters")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listMatters: ${error.message}`);
  return (data as MatterRow[]).map(rowToMatter);
}
