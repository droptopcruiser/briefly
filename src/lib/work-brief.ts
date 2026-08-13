import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";
import { jsonCall, isConfigured } from "./anthropic";
import type { Matter, Rubric, PipelineResult } from "./types";

/**
 * The Initial Work Brief — Briefly's first prepared-work artifact.
 *
 * Product principle: conversation comes in, work comes out. When a matter meets
 * its rubric's ready criteria, readiness is a TRIGGER, not a terminal state: we
 * prepare a concise, structured, source-backed brief so the professional can
 * understand the matter and decide the next step without reconstructing the
 * email thread. The human gate is absolute — a brief is only ever prepared;
 * nothing is sent and no consequential action is taken without explicit approval.
 *
 * Design: the FACTUAL sections (key facts, dates, documents) are assembled
 * DETERMINISTICALLY from the existing PipelineResult, carrying their source
 * quotes/provenance forward untouched — so the brief is grounded, not generic
 * AI prose. The model only writes the judgment-oriented sections (considerations,
 * issues, a suggested next step, questions), always framed for professional
 * review, never as autonomous advice.
 *
 * State model (kept distinct from matter workflow state and readiness):
 *   draft → in_review → approved → superseded
 * A brief is versioned; refreshing supersedes the prior version, so reviewed and
 * approved history is never silently overwritten.
 */

export type WorkBriefState = "draft" | "in_review" | "approved" | "superseded";

/** A fact carried into the brief with its provenance intact. */
export interface BriefFact {
  label: string;
  value: string;
  /** Verbatim source snippet, or "On file from previous matter · …" when carried. */
  source: string | null;
  carried?: boolean;
}

export interface BriefDate {
  date: string | null;
  description: string;
  source: string;
}

export interface BriefDocument {
  label: string;
  /** The rubric requirement this document satisfies (its label). */
  satisfies: string;
}

/** The structured body of a brief. Factual sections are grounded; prose is model-written. */
export interface WorkBriefContent {
  /** 1 — a short orientation to the client's situation and stated objective. */
  summary: string;
  /** 2 + 3 — structured facts relevant to the rubric, each with its source. */
  keyFacts: BriefFact[];
  /** 4 — documents received and which requirement each satisfies. */
  documents: BriefDocument[];
  /** 5 — dates extracted from correspondence/documents. */
  importantDates: BriefDate[];
  /** 6 — uncertainty, caveats, or info that may still matter at ready. */
  considerations: string[];
  /** 7 — important facts, flags, or unusual circumstances the rubric surfaces. */
  rubricIssues: string[];
  /** 8 — a non-autonomous recommendation for the professional to consider. */
  suggestedNextStep: string;
  /** 9 — a draft client message, only when appropriate; never sent automatically. */
  suggestedClientMessage: string | null;
  /** 10 — material ambiguity or decisions needing professional judgment. */
  questionsForProfessional: string[];
}

export interface WorkBrief {
  id: string;
  accountId: string;
  matterId: string;
  version: number;
  state: WorkBriefState;
  content: WorkBriefContent;
  /** Fingerprint of the matter's submission when generated → drives staleness. */
  sourceHash: string;
  /** Readiness at the moment the brief was generated. */
  readiness: number;
  costCents: number;
  mocked: boolean;
  createdAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
}

// --- Persistence (Supabase when configured; process-memory fallback for dev) ---

const globalStore = globalThis as unknown as { __brieflyBriefs?: Map<string, WorkBrief> };
const memory: Map<string, WorkBrief> = (globalStore.__brieflyBriefs ??= new Map());

interface BriefRow {
  id: string;
  account_id: string;
  matter_id: string;
  version: number;
  state: WorkBriefState;
  content: WorkBriefContent;
  source_hash: string | null;
  readiness: number | null;
  cost_cents: number | null;
  mocked: boolean | null;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
}

function rowToBrief(r: BriefRow): WorkBrief {
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

function briefToRow(b: WorkBrief): BriefRow {
  return {
    id: b.id,
    account_id: b.accountId,
    matter_id: b.matterId,
    version: b.version,
    state: b.state,
    content: b.content,
    source_hash: b.sourceHash,
    readiness: b.readiness,
    cost_cents: b.costCents,
    mocked: b.mocked,
    created_at: b.createdAt,
    approved_at: b.approvedAt,
    approved_by: b.approvedBy,
  };
}

async function saveBrief(b: WorkBrief): Promise<void> {
  const db = getSupabase();
  if (!db) {
    memory.set(b.id, b);
    return;
  }
  const { error } = await db.from("work_briefs").upsert(briefToRow(b));
  if (error) throw new Error(`saveBrief: ${error.message}`);
}

/** The highest-version brief for a matter (any state), or null. */
export async function getLatestBrief(matterId: string): Promise<WorkBrief | null> {
  const db = getSupabase();
  if (!db) {
    return (
      [...memory.values()]
        .filter((b) => b.matterId === matterId)
        .sort((a, b) => b.version - a.version)[0] ?? null
    );
  }
  const { data, error } = await db
    .from("work_briefs")
    .select("*")
    .eq("matter_id", matterId)
    .order("version", { ascending: false })
    .limit(1);
  if (error) throw new Error(`getLatestBrief: ${error.message}`);
  return data?.[0] ? rowToBrief(data[0] as BriefRow) : null;
}

/** The current live brief for a matter — the latest one not superseded. */
export async function getActiveBrief(matterId: string): Promise<WorkBrief | null> {
  const latest = await getLatestBrief(matterId);
  return latest && latest.state !== "superseded" ? latest : null;
}

// --- Staleness -------------------------------------------------------------

/** Stable, cheap fingerprint of the matter's evidence (djb2 over the submission). */
export function matterSourceHash(matter: Matter): string {
  const text = matter.submission ?? "";
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

/**
 * True when new client information has arrived since the brief was generated —
 * the brief may be stale and worth refreshing. Only meaningful for a live brief
 * the professional has been reviewing/approving.
 */
export function isBriefStale(brief: WorkBrief, matter: Matter): boolean {
  if (brief.state === "superseded") return false;
  return brief.sourceHash !== matterSourceHash(matter);
}

// --- Generation ------------------------------------------------------------

interface JudgmentOut {
  considerations: string[];
  rubricIssues: string[];
  suggestedNextStep: string;
  suggestedClientMessage: string;
  questionsForProfessional: string[];
}

/** Model-written judgment sections. Framed for review — never autonomous advice. */
async function draftJudgment(
  rubric: Rubric,
  result: PipelineResult,
): Promise<{ out: JudgmentOut; costCents: number }> {
  const facts = result.fields
    .filter((f) => f.present)
    .map((f) => `- ${f.label}: ${f.value}`)
    .join("\n");

  const system = `You are preparing an Initial Work Brief for a professional at a services firm, for a "${rubric.name}" (${rubric.vertical}) matter.
The matter has met the firm's readiness criteria. Everything factual is supplied to you already; your job is ONLY the judgment-oriented sections, to help the professional decide the next step quickly.

STRICT RULES:
- Do NOT give autonomous legal, medical, financial, or other professional advice. Frame everything as "for professional review" / "issues for consideration".
- Do NOT invent facts. Reason only from the facts supplied.
- Be concise, specific to THIS matter, and action-oriented. No filler, no generic AI prose.
- considerations: uncertainty, ambiguity, caveats, or info that may still matter even though the readiness threshold is met. 0-4 short bullet points.
- rubricIssues: important facts, flags, or unusual circumstances relevant to a "${rubric.name}" matter that the professional should notice. 0-4 short bullet points.
- suggestedNextStep: ONE clearly non-autonomous recommended next step for the professional to consider (a single sentence, starting with a verb).
- suggestedClientMessage: a short optional draft message to the client IF one is warranted (e.g. confirming receipt / next steps); otherwise return "". This is a DRAFT for the professional to review and send themselves — never sent automatically.
- questionsForProfessional: any material ambiguity or decision requiring professional judgment. 0-3 short questions. Empty if none.`;

  const user = `Matter summary: ${result.summary}
Client: ${result.clientName ?? "(unknown)"}
Known facts:
${facts || "(none extracted)"}`;

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      considerations: { type: "array", items: { type: "string" } },
      rubricIssues: { type: "array", items: { type: "string" } },
      suggestedNextStep: { type: "string" },
      suggestedClientMessage: { type: "string" },
      questionsForProfessional: { type: "array", items: { type: "string" } },
    },
    required: [
      "considerations",
      "rubricIssues",
      "suggestedNextStep",
      "suggestedClientMessage",
      "questionsForProfessional",
    ],
  };

  const { data, costCents } = await jsonCall<JudgmentOut>({ system, user, schema, maxTokens: 1024 });
  return { out: data, costCents };
}

/** Deterministic judgment fallback when no ANTHROPIC key is configured. */
function mockJudgment(rubric: Rubric, result: PipelineResult): JudgmentOut {
  const carried = result.fields.filter((f) => f.carried).length;
  const considerations: string[] = [];
  if (carried > 0) {
    considerations.push(
      `${carried} fact${carried === 1 ? "" : "s"} were carried forward from a previous matter — confirm they still hold.`,
    );
  }
  considerations.push("Confirm the extracted facts against the original correspondence before acting.");
  return {
    considerations,
    rubricIssues: [],
    suggestedNextStep: `Review the prepared facts for this ${rubric.name.toLowerCase()} and decide whether to begin the work or request confirmation from the client.`,
    suggestedClientMessage: "",
    questionsForProfessional: [],
    // Demo-mode marker lives in the brief's `mocked` flag, surfaced in the UI.
  };
}

/**
 * Assemble the brief content: factual sections straight from the grounded
 * PipelineResult (provenance preserved), judgment sections from the model (or a
 * deterministic stand-in in demo mode).
 */
export async function buildBriefContent(
  rubric: Rubric,
  result: PipelineResult,
): Promise<{ content: WorkBriefContent; costCents: number; mocked: boolean }> {
  const keyFacts: BriefFact[] = result.fields
    .filter((f) => f.present && f.value)
    .map((f) => ({ label: f.label, value: f.value as string, source: f.source, carried: f.carried }));

  const docLabel = new Map(rubric.documents.map((d) => [d.key, d.label]));
  const documents: BriefDocument[] = result.documentsPresent.map((key) => ({
    label: docLabel.get(key) ?? key,
    satisfies: docLabel.get(key) ?? key,
  }));

  const importantDates: BriefDate[] = result.timeline
    .filter((t) => t.date)
    .map((t) => ({ date: t.date, description: t.description, source: t.source }));

  const live = isConfigured();
  let judgment: JudgmentOut;
  let costCents = 0;
  let mocked = true;
  if (live) {
    try {
      const { out, costCents: c } = await draftJudgment(rubric, result);
      judgment = out;
      costCents = c;
      mocked = false;
    } catch (err) {
      console.error("brief judgment draft failed, using fallback:", err);
      judgment = mockJudgment(rubric, result);
    }
  } else {
    judgment = mockJudgment(rubric, result);
  }

  const content: WorkBriefContent = {
    summary: result.summary,
    keyFacts,
    documents,
    importantDates,
    considerations: judgment.considerations.filter(Boolean),
    rubricIssues: judgment.rubricIssues.filter(Boolean),
    suggestedNextStep: judgment.suggestedNextStep.trim(),
    suggestedClientMessage: judgment.suggestedClientMessage.trim() || null,
    questionsForProfessional: judgment.questionsForProfessional.filter(Boolean),
  };
  return { content, costCents, mocked };
}

/**
 * Create a new Initial Work Brief for a ready matter and persist it as `in_review`.
 * Returns null when the matter type opts out of briefs, or the matter has no
 * result. When `supersede` is set, the current live brief is marked superseded
 * first and the new brief's version increments — preserving reviewed history.
 */
export async function createBriefForMatter(
  matter: Matter,
  rubric: Rubric | undefined,
  opts: { supersede?: boolean } = {},
): Promise<WorkBrief | null> {
  if (!matter.result) return null;
  if (rubric && rubric.prepareBriefWhenReady === false) return null;

  const latest = await getLatestBrief(matter.id);
  if (opts.supersede && latest && latest.state !== "superseded") {
    latest.state = "superseded";
    await saveBrief(latest);
  }

  // Fall back to a minimal rubric shape so the factual assembly still works.
  const rb: Rubric =
    rubric ?? {
      id: matter.result.rubricId,
      name: matter.result.rubricName,
      vertical: matter.result.vertical,
      description: "",
      fields: [],
      documents: [],
    };

  const { content, costCents, mocked } = await buildBriefContent(rb, matter.result);
  const brief: WorkBrief = {
    id: randomUUID(),
    accountId: matter.accountId ?? "",
    matterId: matter.id,
    version: (latest?.version ?? 0) + 1,
    state: "in_review",
    content,
    sourceHash: matterSourceHash(matter),
    readiness: matter.result.readiness,
    costCents,
    mocked,
    createdAt: new Date().toISOString(),
    approvedAt: null,
    approvedBy: null,
  };
  await saveBrief(brief);
  return brief;
}

/**
 * Idempotent auto-generation on the ready transition: prepare a brief only if the
 * matter type wants one AND there isn't already a live brief. Reprocessing the
 * same email, refreshing the page, or recalculating readiness will not create a
 * duplicate. Best-effort — a failure here never breaks ingestion.
 */
export async function ensureBriefOnReady(
  matter: Matter,
  rubric: Rubric | undefined,
): Promise<WorkBrief | null> {
  try {
    if (rubric && rubric.prepareBriefWhenReady === false) return null;
    const active = await getActiveBrief(matter.id);
    if (active) return active;
    return await createBriefForMatter(matter, rubric);
  } catch (err) {
    console.error("ensureBriefOnReady failed:", err);
    return null;
  }
}

/** Approve a specific brief version and record who/when. Sends nothing. */
export async function approveBrief(brief: WorkBrief, approverUserId: string | null): Promise<void> {
  brief.state = "approved";
  brief.approvedAt = new Date().toISOString();
  brief.approvedBy = approverUserId;
  await saveBrief(brief);
}
