import { getSupabase } from "./supabase";
import { listMattersByClient } from "./store";
import type { Matter } from "./types";

/**
 * Client memory. A client is an entity per (account, email) that accumulates
 * matters and known facts. Facts are DERIVED from the client's matters (not
 * stored) so they're always fresh; the clients table just gives a stable id,
 * display name, and last-seen for the Clients pages.
 */

export interface Client {
  id: string;
  accountId: string;
  email: string;
  name: string | null;
  lastSeenAt: string;
}

export interface KnownFact {
  key: string;
  label: string;
  value: string;
  originMatterId: string;
  originMatterName: string;
  date: string; // YYYY-MM-DD
}

interface ClientRow {
  id: string;
  account_id: string;
  email: string;
  name: string | null;
  last_seen_at: string;
}

function rowToClient(r: ClientRow): Client {
  return {
    id: r.id,
    accountId: r.account_id,
    email: r.email,
    name: r.name,
    lastSeenAt: r.last_seen_at,
  };
}

const COLS = "id,account_id,email,name,last_seen_at";

/** Record/refresh a client on ingest: set name (if given) and bump last-seen. */
export async function upsertClient(
  accountId: string | null,
  email: string | null,
  name: string | null,
): Promise<void> {
  const db = getSupabase();
  if (!db || !accountId || !email) return;
  const lower = email.toLowerCase();
  const { data: existing } = await db
    .from("clients")
    .select("id,name")
    .eq("account_id", accountId)
    .eq("email", lower)
    .maybeSingle();
  if (existing) {
    await db
      .from("clients")
      .update({ name: name?.trim() || existing.name, last_seen_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await db
      .from("clients")
      .insert({ account_id: accountId, email: lower, name: name?.trim() || null });
  }
}

export async function getClientById(accountId: string, id: string): Promise<Client | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db
    .from("clients")
    .select(COLS)
    .eq("account_id", accountId)
    .eq("id", id)
    .maybeSingle();
  return data ? rowToClient(data as ClientRow) : null;
}

export async function getClientByEmail(accountId: string, email: string): Promise<Client | null> {
  const db = getSupabase();
  if (!db || !email) return null;
  const { data } = await db
    .from("clients")
    .select(COLS)
    .eq("account_id", accountId)
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return data ? rowToClient(data as ClientRow) : null;
}

/** Clients for a firm, with each one's matter count, most-recently-seen first. */
export async function listClients(
  accountId: string,
): Promise<(Client & { matterCount: number })[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data: clientRows } = await db
    .from("clients")
    .select(COLS)
    .eq("account_id", accountId)
    .order("last_seen_at", { ascending: false });
  const { data: matterRows } = await db
    .from("matters")
    .select("client_email")
    .eq("account_id", accountId);

  const counts = new Map<string, number>();
  for (const m of (matterRows ?? []) as { client_email: string | null }[]) {
    const e = m.client_email?.toLowerCase();
    if (e) counts.set(e, (counts.get(e) ?? 0) + 1);
  }
  return ((clientRows ?? []) as ClientRow[]).map((r) => ({
    ...rowToClient(r),
    matterCount: counts.get(r.email.toLowerCase()) ?? 0,
  }));
}

export async function getClientMatters(accountId: string, email: string): Promise<Matter[]> {
  return listMattersByClient(accountId, email);
}

/**
 * The most-recent genuinely-provided value for each field key across the client's
 * matters (carried facts are skipped so provenance points to a real origin).
 */
export async function getKnownFacts(
  accountId: string,
  email: string,
  excludeMatterId?: string,
): Promise<KnownFact[]> {
  const matters = await listMattersByClient(accountId, email); // recent first
  const byKey = new Map<string, KnownFact>();
  for (const m of matters) {
    if (m.id === excludeMatterId || !m.result) continue;
    const date = (m.updatedAt ?? m.createdAt).slice(0, 10);
    for (const f of m.result.fields) {
      if (f.present && f.value && !f.carried && !byKey.has(f.key)) {
        byKey.set(f.key, {
          key: f.key,
          label: f.label,
          value: f.value,
          originMatterId: m.id,
          originMatterName: m.result.rubricName,
          date,
        });
      }
    }
  }
  return [...byKey.values()];
}

/** Returning-client context for the matter view banner. */
export async function getClientContext(
  accountId: string,
  email: string,
  excludeMatterId?: string,
): Promise<{ client: Client | null; priorCount: number; knownFacts: KnownFact[] }> {
  const [client, matters, knownFacts] = await Promise.all([
    getClientByEmail(accountId, email),
    listMattersByClient(accountId, email),
    getKnownFacts(accountId, email, excludeMatterId),
  ]);
  const priorCount = matters.filter((m) => m.id !== excludeMatterId).length;
  return { client, priorCount, knownFacts };
}
