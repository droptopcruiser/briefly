import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";
import { jsonCall, isConfigured } from "./anthropic";
import { matterSourceHash, type WorkBriefState } from "./work-brief";
import {
  mockCorrespondence,
  type CorrespondenceRequest,
  type CorrespondenceDraft,
} from "./correspondence";
import type { Matter, PipelineResult } from "./types";

/**
 * Persistence + model drafting for the Draft Correspondence workflow. Stored in the
 * shared work_briefs table with kind='correspondence' (content = the request + the
 * draft), so no migration is needed. The grounding rules live in the pure
 * ./correspondence module (mock + the Pre-Send check); this only adds the model draft
 * and persistence. It only ever prepares a DRAFT — counsel edits and sends.
 */

export interface CorrespondenceContent {
  request: CorrespondenceRequest;
  draft: CorrespondenceDraft;
}

export interface CorrespondenceRun {
  id: string;
  accountId: string;
  matterId: string;
  version: number;
  state: WorkBriefState;
  content: CorrespondenceContent;
  sourceHash: string;
  costCents: number;
  mocked: boolean;
  createdAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
}

const KIND = "correspondence";

const gc = globalThis as unknown as { __brieflyCorr?: Map<string, CorrespondenceRun> };
const memory: Map<string, CorrespondenceRun> = (gc.__brieflyCorr ??= new Map());

interface Row {
  id: string;
  account_id: string;
  matter_id: string;
  version: number;
  state: WorkBriefState;
  content: CorrespondenceContent;
  source_hash: string | null;
  cost_cents: number | null;
  mocked: boolean | null;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  kind: string;
}

function rowToRun(r: Row): CorrespondenceRun {
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

async function saveRun(run: CorrespondenceRun): Promise<void> {
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
    cost_cents: run.costCents,
    mocked: run.mocked,
    created_at: run.createdAt,
    approved_at: run.approvedAt,
    approved_by: run.approvedBy,
    kind: KIND,
  };
  const { error } = await db.from("work_briefs").upsert(row);
  if (error) throw new Error(`saveRun(correspondence): ${error.message}`);
}

export async function getLatestCorrespondence(matterId: string): Promise<CorrespondenceRun | null> {
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
  if (error) throw new Error(`getLatestCorrespondence: ${error.message}`);
  return data?.[0] ? rowToRun(data[0] as Row) : null;
}

export async function getActiveCorrespondence(matterId: string): Promise<CorrespondenceRun | null> {
  const latest = await getLatestCorrespondence(matterId);
  return latest && latest.state !== "superseded" ? latest : null;
}

interface DraftOut {
  subject: string;
  body: string;
}

async function draftWithModel(
  req: CorrespondenceRequest,
  result: PipelineResult,
  submission: string,
): Promise<{ draft: CorrespondenceDraft; costCents: number }> {
  const known = result.fields.filter((f) => f.present && f.value).map((f) => `- ${f.label}: ${f.value}`).join("\n");
  const system = `You draft a short piece of ADMINISTRATIVE correspondence for a criminal barrister's chambers, for the barrister to review, edit, and send. Write only the subject and body.

HARD RULES:
- Preparation, not advice. Give NO legal advice or view on the charge, plea, defence, bail, or sentence.
- Say only what the point below requires and what the matter's facts support. Invent nothing.
- NEVER state a filing, date, PRN, CRN, or other reference unless it appears in the facts. If the point needs one that isn't supplied, leave a square-bracketed gap (e.g. "[PRN not stated]").
- Chambers voice: courteous, plain, concise. End with a bracketed reviewer note reminding counsel to confirm details before sending. No sign-off name.`;
  const user = `Addressee: ${req.to ?? "[not given]"}
Matter/subject: ${req.about || "[not given]"}
The point to make: ${req.point}

Facts on the matter (use only these; anything else must be bracketed):
${known || "(none extracted)"}

Client enquiry (context):
${submission.slice(0, 2000)}`;
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: { subject: { type: "string" }, body: { type: "string" } },
    required: ["subject", "body"],
  };
  const { data, costCents } = await jsonCall<DraftOut>({ system, user, schema, maxTokens: 700 });
  return { draft: { to: req.to?.trim() || null, subject: data.subject?.trim() || req.about || "Your matter", body: data.body ?? "" }, costCents };
}

async function runDraft(
  req: CorrespondenceRequest,
  result: PipelineResult,
  submission: string,
): Promise<{ draft: CorrespondenceDraft; costCents: number; mocked: boolean }> {
  if (!isConfigured()) return { draft: mockCorrespondence(req), costCents: 0, mocked: true };
  try {
    const { draft, costCents } = await draftWithModel(req, result, submission);
    return { draft, costCents, mocked: false };
  } catch (err) {
    console.error("correspondence draft failed, using template:", err);
    return { draft: mockCorrespondence(req), costCents: 0, mocked: true };
  }
}

/** Prepare (and supersede any prior) correspondence draft for the matter. */
export async function createCorrespondence(matter: Matter, req: CorrespondenceRequest): Promise<CorrespondenceRun | null> {
  if (!matter.result) return null;
  const latest = await getLatestCorrespondence(matter.id);
  if (latest && latest.state !== "superseded") {
    latest.state = "superseded";
    await saveRun(latest);
  }
  const { draft, costCents, mocked } = await runDraft(req, matter.result as PipelineResult, matter.submission ?? "");
  const run: CorrespondenceRun = {
    id: randomUUID(),
    accountId: matter.accountId ?? "",
    matterId: matter.id,
    version: (latest?.version ?? 0) + 1,
    state: "draft",
    content: { request: req, draft },
    sourceHash: matterSourceHash(matter),
    costCents,
    mocked,
    createdAt: new Date().toISOString(),
    approvedAt: null,
    approvedBy: null,
  };
  await saveRun(run);
  return run;
}

/** Mark the correspondence reviewed by counsel. Records who/when. Sends nothing. */
export async function approveCorrespondence(run: CorrespondenceRun, approverUserId: string | null): Promise<void> {
  run.state = "approved";
  run.approvedAt = new Date().toISOString();
  run.approvedBy = approverUserId;
  await saveRun(run);
}
