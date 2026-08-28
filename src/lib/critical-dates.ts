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
 * `known_isos` (the candidates seen at confirmation, for stale detection) is written
 * SEPARATELY and best-effort, so confirming a date never depends on that column
 * existing — the conflict resolver works before the known_isos migration is run.
 */

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
    const { data } = await db.from("matter_critical_dates").select("*").eq("matter_id", matterId);
    for (const r of (data ?? []) as DecisionRow[]) out[r.kind] = rowToDecision(r);
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
    const { data } = await db.from("matter_critical_dates").select("*").eq("account_id", accountId);
    for (const r of (data ?? []) as DecisionRow[]) put(rowToDecision(r));
  } catch (err) {
    console.error("getAccountDateDecisions failed (run critical-dates.sql?):", err);
  }
  return map;
}

/**
 * Persist a human decision (confirm or reject). The CORE row (value/iso/source/
 * provenance/audit) upserts first so the decision always saves. `known_isos` is then
 * set best-effort in a separate update — a missing column can't break confirmation,
 * it just leaves stale-detection dormant until the migration runs.
 */
export async function saveDateDecision(accountId: string, d: DateDecision): Promise<void> {
  const db = getSupabase();
  if (!db) {
    memory.set(memKey(d.matterId, d.kind), d);
    return;
  }
  try {
    await db.from("matter_critical_dates").upsert(
      {
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
      },
      { onConflict: "matter_id,kind" },
    );
  } catch (err) {
    console.error("saveDateDecision failed (run critical-dates.sql?):", err);
    return;
  }
  // Optional stale-detection metadata — never blocks the decision above.
  try {
    await db
      .from("matter_critical_dates")
      .update({ known_isos: d.knownIsos })
      .eq("matter_id", d.matterId)
      .eq("kind", d.kind);
  } catch (err) {
    console.error("saveDateDecision known_isos update skipped (run date-known-isos.sql):", err);
  }
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
  try {
    await db
      .from("matter_critical_dates")
      .delete()
      .eq("account_id", accountId)
      .eq("matter_id", matterId)
      .eq("kind", kind);
  } catch (err) {
    console.error("clearDateDecision failed:", err);
  }
}
