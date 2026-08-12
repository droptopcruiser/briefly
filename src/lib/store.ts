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
  assigned_to: string | null;
  updated_at: string | null;
  last_nudged_at: string | null;
  nudge_count: number | null;
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
    assignedTo: r.assigned_to ?? null,
    updatedAt: r.updated_at ?? r.created_at,
    lastNudgedAt: r.last_nudged_at ?? null,
    nudgeCount: r.nudge_count ?? 0,
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
    assigned_to: m.assignedTo ?? null,
    updated_at: m.updatedAt ?? m.createdAt,
    last_nudged_at: m.lastNudgedAt ?? null,
    nudge_count: m.nudgeCount ?? 0,
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

/**
 * List an account's matters, most recent first. `assignee` filters by assignment:
 * a user id, "unassigned", or undefined for all.
 */
export async function listMatters(
  accountId: string,
  opts: { assignee?: string | "unassigned"; status?: MatterStatus | MatterStatus[]; limit?: number } = {},
): Promise<Matter[]> {
  const { assignee, status, limit = 50 } = opts;
  const statuses = status ? (Array.isArray(status) ? status : [status]) : null;
  const sortKey = (m: Matter) => m.updatedAt ?? m.createdAt;
  const db = getSupabase();
  if (!db) {
    return [...memory.values()]
      .filter((m) => m.accountId === accountId)
      .filter((m) =>
        assignee === undefined
          ? true
          : assignee === "unassigned"
            ? !m.assignedTo
            : m.assignedTo === assignee,
      )
      .filter((m) => (statuses ? statuses.includes(m.status) : true))
      .sort((a, b) => sortKey(b).localeCompare(sortKey(a)))
      .slice(0, limit);
  }
  let query = db.from("matters").select("*").eq("account_id", accountId);
  if (assignee === "unassigned") query = query.is("assigned_to", null);
  else if (assignee) query = query.eq("assigned_to", assignee);
  if (statuses) query = query.in("status", statuses);

  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listMatters: ${error.message}`);
  return (data as MatterRow[]).map(rowToMatter);
}

/**
 * Matters stuck waiting on the client across ALL accounts (for the reminder
 * sweep): awaiting_client, no activity for `thresholdDays`, a client email
 * present, and not nudged within the threshold. Callers filter to those with a
 * draft to chase.
 */
export async function listStuckMatters(thresholdDays: number, limit = 100): Promise<Matter[]> {
  const db = getSupabase();
  if (!db) return [];
  const cutoff = new Date(Date.now() - thresholdDays * 86_400_000).toISOString();
  const { data, error } = await db
    .from("matters")
    .select("*")
    .eq("status", "awaiting_client")
    .not("client_email", "is", null)
    .lt("updated_at", cutoff)
    .or(`last_nudged_at.is.null,last_nudged_at.lt.${cutoff}`)
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`listStuckMatters: ${error.message}`);
  return (data as MatterRow[]).map(rowToMatter);
}

/** All of a client's matters (by email) in an account, most recent first. */
export async function listMattersByClient(accountId: string, email: string): Promise<Matter[]> {
  const db = getSupabase();
  if (!db) {
    return [...memory.values()]
      .filter(
        (m) => m.accountId === accountId && m.clientEmail?.toLowerCase() === email.toLowerCase(),
      )
      .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
  }
  const { data, error } = await db
    .from("matters")
    .select("*")
    .eq("account_id", accountId)
    .ilike("client_email", email)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`listMattersByClient: ${error.message}`);
  return (data as MatterRow[]).map(rowToMatter);
}

/**
 * The most recent non-approved matter for a client (by email) in an account — the
 * threading fallback when a reply arrives without a matter tag.
 */
export async function findOpenMatterByClient(
  accountId: string,
  email: string,
): Promise<Matter | null> {
  const db = getSupabase();
  if (!db) {
    return (
      [...memory.values()]
        .filter(
          (m) =>
            m.accountId === accountId &&
            m.status !== "completed" &&
            m.clientEmail?.toLowerCase() === email.toLowerCase(),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
    );
  }
  const { data, error } = await db
    .from("matters")
    .select("*")
    .eq("account_id", accountId)
    .neq("status", "completed")
    .ilike("client_email", email)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`findOpenMatterByClient: ${error.message}`);
  return data?.[0] ? rowToMatter(data[0] as MatterRow) : null;
}
