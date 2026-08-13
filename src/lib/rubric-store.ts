import { getSupabase } from "./supabase";
import { SEED_RUBRICS } from "./rubrics";
import type { Rubric } from "./types";

/**
 * Rubric persistence (BYOR). Firms author their own matter types; each rubric
 * belongs to an account. The full field/document definition lives in a jsonb
 * column. An account's *effective* rubrics are its authored ones, or the
 * built-in seed set if it hasn't authored any yet — so intake works out of the
 * box and gets more tailored as the firm adds its own.
 */

interface RubricRow {
  id: string;
  account_id: string | null;
  name: string;
  vertical: string;
  definition: {
    description: string;
    fields: Rubric["fields"];
    documents: Rubric["documents"];
    prepareBriefWhenReady?: boolean;
  };
  created_at?: string;
  updated_at?: string;
}

function rowToRubric(r: RubricRow): Rubric {
  return {
    id: r.id,
    name: r.name,
    vertical: r.vertical,
    description: r.definition.description,
    fields: r.definition.fields,
    documents: r.definition.documents,
    prepareBriefWhenReady: r.definition.prepareBriefWhenReady,
  };
}

function rubricToRow(accountId: string, r: Rubric): RubricRow {
  return {
    id: r.id,
    account_id: accountId,
    name: r.name,
    vertical: r.vertical,
    definition: {
      description: r.description,
      fields: r.fields,
      documents: r.documents,
      prepareBriefWhenReady: r.prepareBriefWhenReady,
    },
    updated_at: new Date().toISOString(),
  };
}

/** The account's own authored rubrics (empty if none / no DB). */
export async function getAccountRubrics(accountId: string): Promise<Rubric[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data, error } = await db
    .from("rubrics")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getAccountRubrics: ${error.message}`);
  return (data as RubricRow[]).map(rowToRubric);
}

/** Rubrics the pipeline should classify against: authored ones, or the seeds. */
export async function getEffectiveRubrics(accountId: string | null): Promise<Rubric[]> {
  if (!accountId) return SEED_RUBRICS;
  const own = await getAccountRubrics(accountId);
  return own.length > 0 ? own : SEED_RUBRICS;
}

export async function getAccountRubric(accountId: string, id: string): Promise<Rubric | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db
    .from("rubrics")
    .select("*")
    .eq("account_id", accountId)
    .eq("id", id)
    .maybeSingle();
  return data ? rowToRubric(data as RubricRow) : null;
}

export async function saveRubric(accountId: string, rubric: Rubric): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  const { error } = await db.from("rubrics").upsert(rubricToRow(accountId, rubric));
  if (error) throw new Error(`saveRubric: ${error.message}`);
}

export async function deleteRubric(accountId: string, id: string): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  const { error } = await db.from("rubrics").delete().eq("account_id", accountId).eq("id", id);
  if (error) throw new Error(`deleteRubric: ${error.message}`);
}
