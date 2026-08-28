import "server-only";
import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";
import type { CriticalDateKind, DateDecision } from "./critical-date-types";

/**
 * Critical-date PERSISTENCE — server-only (privileged DB access via the service
 * key). `import "server-only"` makes it a build error for any client component to
 * import this module. Types + display helpers live in critical-date-types.ts and
 * pure derivation in critical-date-derive.ts, which the client may import freely.
 *
 * Only the human DECISION (confirm / reject) is stored, in matter_critical_dates.
 *
 * Stale/third-date detection (Release B) is gated by an explicit feature flag,
 * `staleDatesEnabled()`. When OFF (the default), `known_isos` is NOT written at all
 * and stale is never computed — so basic confirmation works with or without that
 * column, and Briefly never behaves as though it's watching for new conflicting
 * evidence when the persistence isn't guaranteed. Turn the flag on ONLY after the
 * date-known-isos.sql migration has run and been tested against real persistence.
 */

/** Release-B gate: stale/third-date detection is active only when this is true. */
export function staleDatesEnabled(): boolean {
  return process.env.CRITICAL_DATE_STALE === "1";
}

// Columns that DEFINITELY exist (Release A). known_isos is appended ONLY when the
// flag is on (Release B, after its migration) — so a Release-A read never names a
// column that may not have been migrated.
const BASE_COLS = "matter_id,kind,status,value,iso,source,from_document,confirmed_by,confirmed_at";
function selectCols(): string {
  return staleDatesEnabled() ? `${BASE_COLS},known_isos` : BASE_COLS;
}

// Internal diagnostic — logged once per server process so the deployment state is
// visible in logs when stale is later enabled.
const diag = globalThis as unknown as { __brieflyStaleLogged?: boolean };
if (!diag.__brieflyStaleLogged) {
  diag.__brieflyStaleLogged = true;
  console.log(`[critical-dates] stale_dates: ${staleDatesEnabled() ? "ENABLED — Release B" : "disabled — Release A"}`);
}

const globalStore = globalThis as unknown as { __brieflyDates?: Map<string, DateDecision> };
const memory: Map<string, DateDecision> = (globalStore.__brieflyDates ??= new Map());
const memKey = (matterId: string, kind: CriticalDateKind) => `${matterId}:${kind}`;

interface DecisionRow {
  matter_id: string;
  kind: CriticalDateKind;
  status: "confirmed" | "rejected";
  value: string | null;
  iso: string | null;
  source: string | null;
  from_document: { fileName: string; page: number | null } | null;
  confirmed_by: string | null;
  confirmed_at: string;
  known_isos: string[] | null;
}

function rowToDecision(r: DecisionRow): DateDecision {
  return {
    matterId: r.matter_id,
    kind: r.kind,
    status: r.status,
    value: r.value ?? "",
    iso: r.iso,
    source: r.source,
    fromDocument: r.from_document,
    confirmedBy: r.confirmed_by,
    confirmedAt: r.confirmed_at,
    knownIsos: Array.isArray(r.known_isos) ? r.known_isos : [],
  };
}

/** All stored date decisions for one matter, keyed by kind. */
export async function getMatterDateDecisions(
  matterId: string,
): Promise<Partial<Record<CriticalDateKind, DateDecision>>> {
  const out: Partial<Record<CriticalDateKind, DateDecision>> = {};
  const db = getSupabase();
  if (!db) {
    for (const d of memory.values()) if (d.matterId === matterId) out[d.kind] = d;
    return out;
  }
  try {
    const { data } = await db.from("matter_critical_dates").select(selectCols()).eq("matter_id", matterId);
    for (const r of (data ?? []) as unknown as DecisionRow[]) out[r.kind] = rowToDecision(r);
  } catch (err) {
    console.error("getMatterDateDecisions failed (run critical-dates.sql?):", err);
  }
  return out;
}

/** Stored decisions for a whole account, keyed by matterId then kind — one query. */
export async function getAccountDateDecisions(
  accountId: string,
): Promise<Map<string, Partial<Record<CriticalDateKind, DateDecision>>>> {
  const map = new Map<string, Partial<Record<CriticalDateKind, DateDecision>>>();
  const put = (d: DateDecision) => {
    const cur = map.get(d.matterId) ?? {};
    cur[d.kind] = d;
    map.set(d.matterId, cur);
  };
  const db = getSupabase();
  if (!db) {
    for (const d of memory.values()) put(d);
    return map;
  }
  try {
    const { data } = await db.from("matter_critical_dates").select(selectCols()).eq("account_id", accountId);
    for (const r of (data ?? []) as unknown as DecisionRow[]) put(rowToDecision(r));
  } catch (err) {
    console.error("getAccountDateDecisions failed (run critical-dates.sql?):", err);
  }
  return map;
}

/**
 * Persist a human decision (confirm or reject). ONE atomic upsert. `known_isos` is
 * included ONLY when stale detection is enabled (Release B) — never as a separate
 * best-effort write. With the flag off, the column is not touched, so basic
 * confirmation works whether or not the column exists.
 */
export async function saveDateDecision(accountId: string, d: DateDecision): Promise<void> {
  const db = getSupabase();
  if (!db) {
    memory.set(memKey(d.matterId, d.kind), d);
    return;
  }
  const row: Record<string, unknown> = {
    id: randomUUID(),
    account_id: accountId,
    matter_id: d.matterId,
    kind: d.kind,
    status: d.status,
    value: d.value || null,
    iso: d.iso,
    source: d.source,
    from_document: d.fromDocument,
    confirmed_by: d.confirmedBy,
    confirmed_at: d.confirmedAt,
  };
  // Release B only: this write is REQUIRED (not best-effort) when the flag is on.
  // If it fails (e.g. the migration hasn't run), the whole decision fails and is
  // surfaced — Briefly never records a confirmation while pretending stale is armed.
  if (staleDatesEnabled()) row.known_isos = d.knownIsos;

  const { error } = await db
    .from("matter_critical_dates")
    .upsert(row, { onConflict: "matter_id,kind" });
  if (error) throw new Error(`saveDateDecision: ${error.message}`);
}

/** Remove a decision entirely, so the matter falls back to the derived candidate. */
export async function clearDateDecision(
  accountId: string,
  matterId: string,
  kind: CriticalDateKind,
): Promise<void> {
  const db = getSupabase();
  if (!db) {
    memory.delete(memKey(matterId, kind));
    return;
  }
  // A decision write — fail loudly (like saveDateDecision) rather than silently.
  const { error } = await db
    .from("matter_critical_dates")
    .delete()
    .eq("account_id", accountId)
    .eq("matter_id", matterId)
    .eq("kind", kind);
  if (error) throw new Error(`clearDateDecision: ${error.message}`);
}
