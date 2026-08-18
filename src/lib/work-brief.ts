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

/**
 * "Briefly noticed" — the signature interpretation, made VISIBLE as a reasoning
 * chain rather than a paragraph: because (the facts connected → the implication),
 * the action that follows (the brief's suggestedNextStep), the specific facts/rule
 * it was built from, and what happens next. Null until the judgment phase fills it.
 */
export interface BriefInsight {
  /** 2-3 connected constraints, each a short statement — the visible links in the chain. */
  factors: string[];
  /** The matter consequence the factors FORCE together — the non-obvious "so what". */
  consequence: string;
  /** Forward motion: what Briefly does once the professional decides. One sentence. */
  afterThis: string;
}

/** The structured body of a brief. Factual sections are grounded; prose is model-written. */
export interface WorkBriefContent {
  /** 0 — "Briefly noticed": the visible reasoning chain. Null until judgment fills it. */
  insight: BriefInsight | null;
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
  /**
   * True while the judgment sections (6-10) are still being prepared. The
   * deterministic, source-backed sections (summary, facts, documents, dates) are
   * filled instantly; the model-written judgment fills in a moment later. Lets
   * the UI show the useful facts immediately instead of holding the whole screen.
   */
  judgmentPending?: boolean;
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
  /** Discriminates the shared work_briefs table; this module owns 'initial_brief'. */
  kind: string;
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
    kind: "initial_brief",
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
    .eq("kind", "initial_brief")
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
  insight: BriefInsight;
  considerations: string[];
  rubricIssues: string[];
  suggestedNextStep: string;
  suggestedClientMessage: string;
  questionsForProfessional: string[];
}

/**
 * A compact, pre-assembled bundle for the judgment model call — structured facts
 * only, not the whole email thread. Keeps the prompt small (faster) while
 * preserving the grounding (the facts already carry their sources in the brief).
 */
interface JudgmentInput {
  rubricName: string;
  vertical: string;
  summary: string;
  clientName: string | null;
  facts: { label: string; value: string }[];
  carriedCount: number;
}

/** Model-written judgment sections. Framed for review — never autonomous advice. */
async function draftJudgment(input: JudgmentInput): Promise<{ out: JudgmentOut; costCents: number }> {
  const facts = input.facts.map((f) => `- ${f.label}: ${f.value}`).join("\n");

  const system = `You are preparing the judgment sections of an Initial Work Brief for a professional at a services firm, for a "${input.rubricName}" (${input.vertical}) matter that has met the firm's readiness criteria. All facts are supplied; write ONLY the judgment sections, concise and specific to THIS matter.

RULES:
- No autonomous legal/medical/financial advice. Frame as "for professional review" / "issues for consideration".
- Reason only from the supplied facts; invent nothing.
- insight — THE MOST IMPORTANT FIELD ("Briefly noticed"). Make the reasoning a VISIBLE CHAIN of discrete links, not prose:
  · factors: the 2-3 SEPARATE facts/constraints you are connecting, each as its own short statement (e.g. "Wants to sell before the school year", "Only available weekday mornings"). At least two — these are the links the professional would otherwise have to connect themselves.
  · consequence: the matter consequence these factors FORCE together — the non-obvious "so what" that changes the action, going BEYOND restating the factors. (Strong: "The appraisal can't simply be scheduled — it must be booked early enough to preserve preparation time before listing.") One sentence.
  · afterThis: ONE sentence of forward motion — what Briefly does once the professional decides (e.g. "Briefly will update the matter timeline and build the consultation plan around the confirmed timing"). Reference Briefly's own follow-through, never autonomous client action.
  Self-test the consequence: "Could this have been written from a single factor, or for any ${input.vertical.toLowerCase()} matter?" If yes, rewrite. If genuinely nothing connects, set factors to the single most decision-relevant fact and consequence to its implication.
- suggestedNextStep: "Decision now" — the ONE decision/action that follows from the consequence (a single sentence, verb first).
- suggestedClientMessage: a short, warm, human draft to the client that PROVES the insight — reflect the reason and constraint you noticed (their deadline, their availability), not merely restating the request. Else "" if no message is warranted. A draft the professional sends themselves — never sent automatically.
- considerations: caveats or info that may still matter even at readiness. 0-3 short bullets.
- rubricIssues: notable facts/flags for a "${input.rubricName}" matter. 0-3 short bullets.
- questionsForProfessional: material ambiguities needing judgment. 0-3 short questions, else empty.`;

  const user = `Matter summary: ${input.summary}
Client: ${input.clientName ?? "(unknown)"}
Known facts:
${facts || "(none extracted)"}`;

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      insight: {
        type: "object",
        additionalProperties: false,
        properties: {
          factors: { type: "array", items: { type: "string" } },
          consequence: { type: "string" },
          afterThis: { type: "string" },
        },
        required: ["factors", "consequence", "afterThis"],
      },
      considerations: { type: "array", items: { type: "string" } },
      rubricIssues: { type: "array", items: { type: "string" } },
      suggestedNextStep: { type: "string" },
      suggestedClientMessage: { type: "string" },
      questionsForProfessional: { type: "array", items: { type: "string" } },
    },
    required: [
      "insight",
      "considerations",
      "rubricIssues",
      "suggestedNextStep",
      "suggestedClientMessage",
      "questionsForProfessional",
    ],
  };

  const { data, costCents } = await jsonCall<JudgmentOut>({ system, user, schema, maxTokens: 760 });
  return { out: data, costCents };
}

/** Deterministic judgment fallback (demo mode, or if the model call fails). */
function mockJudgment(input: JudgmentInput): JudgmentOut {
  const considerations: string[] = [];
  if (input.carriedCount > 0) {
    considerations.push(
      `${input.carriedCount} fact${input.carriedCount === 1 ? "" : "s"} were carried forward from a previous matter — confirm they still hold.`,
    );
  }
  considerations.push("Confirm the extracted facts against the original correspondence before acting.");
  return {
    insight: { factors: [], consequence: "", afterThis: "" },
    considerations,
    rubricIssues: [],
    suggestedNextStep: `Review the prepared facts for this ${input.rubricName.toLowerCase()} and decide whether to begin the work or request confirmation from the client.`,
    suggestedClientMessage: "",
    questionsForProfessional: [],
  };
}

/** Run the judgment (live or mock), timed, with a deterministic fallback on error. */
async function runJudgment(
  input: JudgmentInput,
): Promise<{ judgment: JudgmentOut; costCents: number; mocked: boolean }> {
  if (!isConfigured()) return { judgment: mockJudgment(input), costCents: 0, mocked: true };
  const t = Date.now();
  try {
    const { out, costCents } = await draftJudgment(input);
    console.log(`[brief-timing] judgment model call ms=${Date.now() - t}`);
    return { judgment: out, costCents, mocked: false };
  } catch (err) {
    console.error(`[brief-timing] judgment model FAILED ms=${Date.now() - t}, using fallback:`, err);
    return { judgment: mockJudgment(input), costCents: 0, mocked: true };
  }
}

/** Build the compact judgment bundle from a full pipeline result. */
function judgmentInputFromResult(rubric: Rubric, result: PipelineResult): JudgmentInput {
  const present = result.fields.filter((f) => f.present && f.value);
  return {
    rubricName: rubric.name,
    vertical: rubric.vertical,
    summary: result.summary,
    clientName: result.clientName,
    facts: present.slice(0, 24).map((f) => ({ label: f.label, value: f.value as string })),
    carriedCount: present.filter((f) => f.carried).length,
  };
}

/**
 * The deterministic, source-backed sections — assembled instantly from the
 * grounded result, no model. `judgmentPending: true` marks that sections 6-10
 * are still being prepared.
 */
export function buildFactualContent(rubric: Rubric, result: PipelineResult): WorkBriefContent {
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

  return {
    insight: null,
    summary: result.summary,
    keyFacts,
    documents,
    importantDates,
    considerations: [],
    rubricIssues: [],
    suggestedNextStep: "",
    suggestedClientMessage: null,
    questionsForProfessional: [],
    judgmentPending: true,
  };
}

/** Merge model-written judgment sections into factual content. */
function applyJudgment(content: WorkBriefContent, judgment: JudgmentOut): WorkBriefContent {
  return {
    ...content,
    insight: judgment.insight.consequence.trim()
      ? {
          factors: judgment.insight.factors.filter(Boolean),
          consequence: judgment.insight.consequence.trim(),
          afterThis: judgment.insight.afterThis.trim(),
        }
      : null,
    considerations: judgment.considerations.filter(Boolean),
    rubricIssues: judgment.rubricIssues.filter(Boolean),
    suggestedNextStep: judgment.suggestedNextStep.trim(),
    suggestedClientMessage: judgment.suggestedClientMessage.trim() || null,
    questionsForProfessional: judgment.questionsForProfessional.filter(Boolean),
    judgmentPending: false,
  };
}

/** Minimal rubric shape when the account's rubric can't be resolved. */
function fallbackRubric(result: PipelineResult): Rubric {
  return {
    id: result.rubricId,
    name: result.rubricName,
    vertical: result.vertical,
    description: "",
    fields: [],
    documents: [],
  };
}

/**
 * Create a new Initial Work Brief for a ready matter, persisted as `in_review`.
 * Returns null when the matter type opts out, or the matter has no result. When
 * `supersede` is set, the current live brief is superseded first (version bumps),
 * preserving reviewed history.
 *
 * By default this is the FAST path: it fills the deterministic, source-backed
 * sections and returns immediately with `judgmentPending` — the model-written
 * judgment is completed separately (see completeJudgmentForBrief) so the useful
 * facts render in ~1s instead of after a ~15-20s model call. Pass
 * `withJudgment: true` for background callers (email ingest) where latency is
 * invisible and a complete brief is preferable.
 */
export async function createBriefForMatter(
  matter: Matter,
  rubric: Rubric | undefined,
  opts: { supersede?: boolean; withJudgment?: boolean } = {},
): Promise<WorkBrief | null> {
  if (!matter.result) return null;
  if (rubric && rubric.prepareBriefWhenReady === false) return null;

  const latest = await getLatestBrief(matter.id);
  if (opts.supersede && latest && latest.state !== "superseded") {
    latest.state = "superseded";
    await saveBrief(latest);
  }

  const rb = rubric ?? fallbackRubric(matter.result);

  const tFacts = Date.now();
  let content = buildFactualContent(rb, matter.result);
  console.log(`[brief-timing] factual assembly ms=${Date.now() - tFacts}`);
  let costCents = 0;
  let mocked = true;

  if (opts.withJudgment) {
    const { judgment, costCents: c, mocked: m } = await runJudgment(
      judgmentInputFromResult(rb, matter.result),
    );
    content = applyJudgment(content, judgment);
    costCents = c;
    mocked = m;
  }

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
  const tSave = Date.now();
  await saveBrief(brief);
  console.log(`[brief-timing] brief persisted ms=${Date.now() - tSave} (withJudgment=${!!opts.withJudgment})`);
  return brief;
}

/**
 * Complete the judgment sections of the current live brief if they're still
 * pending. Runs the model on the compact fact bundle (reconstructed from the
 * brief's own facts + the matter), merges the result, and persists. Idempotent:
 * a no-op once judgment is filled. Returns the (updated) brief, or null.
 */
export async function completeJudgmentForBrief(
  matter: Matter,
  rubric: Rubric | undefined,
): Promise<WorkBrief | null> {
  const brief = await getActiveBrief(matter.id);
  if (!brief) return null;
  if (!brief.content.judgmentPending) return brief;

  const rb = rubric ?? (matter.result ? fallbackRubric(matter.result) : undefined);
  const input: JudgmentInput = {
    rubricName: rb?.name ?? brief.content.summary.slice(0, 40),
    vertical: rb?.vertical ?? "",
    summary: brief.content.summary,
    clientName: matter.clientName,
    facts: brief.content.keyFacts.slice(0, 24).map((f) => ({ label: f.label, value: f.value })),
    carriedCount: brief.content.keyFacts.filter((f) => f.carried).length,
  };

  const { judgment, costCents, mocked } = await runJudgment(input);
  brief.content = applyJudgment(brief.content, judgment);
  brief.costCents += costCents;
  brief.mocked = mocked;
  await saveBrief(brief);
  return brief;
}

/**
 * Idempotent auto-generation on the ready transition: prepare a COMPLETE brief
 * (facts + judgment) only if the matter type wants one AND there isn't already a
 * live brief. This runs in the background (email ingest), where the model latency
 * is invisible, so the professional opens the matter to a finished brief.
 * Best-effort — a failure here never breaks ingestion.
 */
export async function ensureBriefOnReady(
  matter: Matter,
  rubric: Rubric | undefined,
): Promise<WorkBrief | null> {
  try {
    if (rubric && rubric.prepareBriefWhenReady === false) return null;
    const active = await getActiveBrief(matter.id);
    if (active) return active;
    return await createBriefForMatter(matter, rubric, { withJudgment: true });
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
