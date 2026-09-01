import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";
import { jsonCall, isConfigured } from "./anthropic";
import { matterSourceHash, type WorkBriefState } from "./work-brief";
import {
  CRIMINAL_RUBRIC,
  buildFileOpenNote,
  fileOpenGate,
  mockAdminSections,
  type FileOpenNote,
} from "./criminal";
import type { Matter, PipelineResult } from "./types";

/**
 * The File Open workflow — the first criminal Chambers Workflow. When a criminal
 * matter has its charging document AND Summary of Facts, Briefly prepares a
 * source-backed File Open note: identifiers, charge, elements, disclosure status, an
 * administrative first-letter draft, and the first assistant job.
 *
 * Same artifact rail as the Initial Work Brief and the Pre-Consultation Packet
 * (versioned, source-backed, two-phase, review-gated), stored in the shared
 * work_briefs table with kind='file_open' — no migration needed. The SAFETY-CRITICAL
 * logic (the hard stop, the grounding, the no-advice mock) lives in the pure,
 * unit-tested ./criminal module and can't be bypassed from here.
 *
 * The boundary is absolute: this only ever prepares a DRAFT. Nothing is sent; counsel
 * reviews, decides, and sends. A fact that isn't in the material is a bracketed gap.
 */

export interface FileOpenRun {
  id: string;
  accountId: string;
  matterId: string;
  version: number;
  state: WorkBriefState;
  content: FileOpenNote;
  sourceHash: string;
  readiness: number;
  costCents: number;
  mocked: boolean;
  createdAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
}

const KIND = "file_open";

// --- Persistence (shared work_briefs table; process-memory fallback) ----------

const globalStore = globalThis as unknown as { __brieflyFileOpen?: Map<string, FileOpenRun> };
const memory: Map<string, FileOpenRun> = (globalStore.__brieflyFileOpen ??= new Map());

interface RunRow {
  id: string;
  account_id: string;
  matter_id: string;
  version: number;
  state: WorkBriefState;
  content: FileOpenNote;
  source_hash: string | null;
  readiness: number | null;
  cost_cents: number | null;
  mocked: boolean | null;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  kind: string;
}

function rowToRun(r: RunRow): FileOpenRun {
  return {
    id: r.id,
    accountId: r.account_id,
    matterId: r.matter_id,
    version: r.version,
    state: r.state,
    content: r.content,
    sourceHash: r.source_hash ?? "",
    readiness: r.readiness ?? 0,
    costCents: r.cost_cents ?? 0,
    mocked: r.mocked ?? false,
    createdAt: r.created_at,
    approvedAt: r.approved_at,
    approvedBy: r.approved_by,
  };
}

function runToRow(run: FileOpenRun): RunRow {
  return {
    id: run.id,
    account_id: run.accountId,
    matter_id: run.matterId,
    version: run.version,
    state: run.state,
    content: run.content,
    source_hash: run.sourceHash,
    readiness: run.readiness,
    cost_cents: run.costCents,
    mocked: run.mocked,
    created_at: run.createdAt,
    approved_at: run.approvedAt,
    approved_by: run.approvedBy,
    kind: KIND,
  };
}

async function saveRun(run: FileOpenRun): Promise<void> {
  const db = getSupabase();
  if (!db) {
    memory.set(run.id, run);
    return;
  }
  const { error } = await db.from("work_briefs").upsert(runToRow(run));
  if (error) throw new Error(`saveRun: ${error.message}`);
}

export async function getLatestFileOpen(matterId: string): Promise<FileOpenRun | null> {
  const db = getSupabase();
  if (!db) {
    return (
      [...memory.values()].filter((r) => r.matterId === matterId).sort((a, b) => b.version - a.version)[0] ??
      null
    );
  }
  const { data, error } = await db
    .from("work_briefs")
    .select("*")
    .eq("matter_id", matterId)
    .eq("kind", KIND)
    .order("version", { ascending: false })
    .limit(1);
  if (error) throw new Error(`getLatestFileOpen: ${error.message}`);
  return data?.[0] ? rowToRun(data[0] as RunRow) : null;
}

export async function getActiveFileOpen(matterId: string): Promise<FileOpenRun | null> {
  const latest = await getLatestFileOpen(matterId);
  return latest && latest.state !== "superseded" ? latest : null;
}

/** New material arrived since the note was prepared — it may be out of date. */
export function isFileOpenStale(run: FileOpenRun, matter: Matter): boolean {
  if (run.state === "superseded") return false;
  return run.sourceHash !== matterSourceHash(matter);
}

// --- Generation ---------------------------------------------------------------

interface AdminOut {
  clientLetterDraft: string;
  firstAssistantJob: string;
}

/**
 * Model-written administrative sections — the first client letter and the first
 * assistant job. STRICTLY administrative: acknowledge the file, arrange a meeting,
 * open the folder. No advice; square brackets for anything not stated; reason only
 * from the supplied facts.
 */
async function draftAdmin(note: FileOpenNote): Promise<{ out: AdminOut; costCents: number }> {
  const facts = [...note.identifiers, ...note.charge, note.firstAppearance, note.disclosureStatus]
    .map((i) => `- ${i.label}: ${i.value ?? "[not stated]"}`)
    .join("\n");

  const system = `You are a criminal chambers assistant preparing the ADMINISTRATIVE opening of a new matter for a barrister to review. Write ONLY two things, both strictly administrative.

HARD RULES:
- This is preparation, not advice. Give NO legal advice, NO view on the charge, plea, defence, bail, or sentence. The barrister reviews, decides, and sends everything.
- Invent nothing. If a fact is "[not stated]" above, leave it as a square-bracketed gap in your output (e.g. "[first appearance not stated]"). Never guess a date, court, name, or reference.
- clientLetterDraft: a short, plain, professional letter to the defendant that only: acknowledges the chambers has opened the file and received the charging document and summary of facts, notes the court and first appearance if known, and proposes arranging a time to discuss the matter. End with a bracketed reviewer note reminding counsel to confirm meeting time, contact details, and any bail conditions before sending. No advice, no reassurance about outcome.
- firstAssistantJob: one short sentence — the first administrative task (e.g. open the matter folder, diarise the first appearance, confirm contact details). Administrative only.`;

  const user = `Matter facts (already extracted; "[not stated]" means absent — keep it bracketed):
${facts}`;

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      clientLetterDraft: { type: "string" },
      firstAssistantJob: { type: "string" },
    },
    required: ["clientLetterDraft", "firstAssistantJob"],
  };

  const { data, costCents } = await jsonCall<AdminOut>({ system, user, schema, maxTokens: 500 });
  return { out: data, costCents };
}

async function runAdmin(note: FileOpenNote): Promise<{ out: AdminOut; costCents: number; mocked: boolean }> {
  if (!isConfigured()) return { out: mockAdminSections(note), costCents: 0, mocked: true };
  try {
    const { out, costCents } = await draftAdmin(note);
    return { out, costCents, mocked: false };
  } catch (err) {
    console.error("file-open admin draft failed, using fallback:", err);
    return { out: mockAdminSections(note), costCents: 0, mocked: true };
  }
}

/** The outcome of trying to run File Open: either the prepared run, or the blocking gate. */
export type FileOpenResult =
  | { ok: true; run: FileOpenRun }
  | { ok: false; reason: string; missing: string[] };

/**
 * Prepare a File Open note for a criminal matter, persisted as a `draft`.
 *
 * Enforces the hard stop first: without the charging document AND the Summary of
 * Facts, it does not run — it returns the reason and what's missing. By default this
 * is the FAST path (deterministic note only, adminPending), so the source-backed
 * facts render immediately; the admin sections complete separately. `supersede` bumps
 * the version, preserving reviewed history.
 */
export async function createFileOpenForMatter(
  matter: Matter,
  opts: { supersede?: boolean; withAdmin?: boolean } = {},
): Promise<FileOpenResult> {
  const gate = fileOpenGate(matter.result);
  if (!gate.ok) return { ok: false, reason: gate.reason ?? "Not ready to run.", missing: gate.missing };

  const result = matter.result as PipelineResult;

  const latest = await getLatestFileOpen(matter.id);
  if (opts.supersede && latest && latest.state !== "superseded") {
    latest.state = "superseded";
    await saveRun(latest);
  }

  let content = buildFileOpenNote(result);
  let costCents = 0;
  let mocked = true;

  if (opts.withAdmin) {
    const { out, costCents: c, mocked: m } = await runAdmin(content);
    content = { ...content, clientLetterDraft: out.clientLetterDraft, firstAssistantJob: out.firstAssistantJob, adminPending: false };
    costCents = c;
    mocked = m;
  }

  const run: FileOpenRun = {
    id: randomUUID(),
    accountId: matter.accountId ?? "",
    matterId: matter.id,
    version: (latest?.version ?? 0) + 1,
    state: "draft",
    content,
    sourceHash: matterSourceHash(matter),
    readiness: result.readiness,
    costCents,
    mocked,
    createdAt: new Date().toISOString(),
    approvedAt: null,
    approvedBy: null,
  };
  await saveRun(run);
  return { ok: true, run };
}

/** Phase two — fill the administrative sections of the live run if still pending. */
export async function completeAdminForFileOpen(matterId: string): Promise<FileOpenRun | null> {
  const run = await getActiveFileOpen(matterId);
  if (!run) return null;
  if (!run.content.adminPending) return run;

  const { out, costCents, mocked } = await runAdmin(run.content);
  run.content = { ...run.content, clientLetterDraft: out.clientLetterDraft, firstAssistantJob: out.firstAssistantJob, adminPending: false };
  run.costCents += costCents;
  run.mocked = mocked;
  await saveRun(run);
  return run;
}

/** Mark the note reviewed by counsel. Records who/when. Sends nothing. */
export async function approveFileOpen(run: FileOpenRun, approverUserId: string | null): Promise<void> {
  run.state = "approved";
  run.approvedAt = new Date().toISOString();
  run.approvedBy = approverUserId;
  await saveRun(run);
}

/** Re-export so callers can pre-check the gate before offering the workflow. */
export { fileOpenGate, CRIMINAL_RUBRIC };
