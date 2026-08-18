import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";
import { jsonCall, isConfigured } from "./anthropic";
import { matterSourceHash, type WorkBriefState } from "./work-brief";
import { getBaselineReview, computeMatterChanges } from "./reviews";
import type { Matter, Rubric, PipelineResult } from "./types";

/**
 * The Pre-Consultation Packet — lifecycle slice one. When a ready matter has a
 * consultation booked (matter.consultationAt), Briefly compiles a briefing so the
 * professional walks in prepared instead of reconstructing the file.
 *
 * Same artifact rail as the Initial Work Brief (versioned, source-backed, two-phase,
 * review-gated), stored in the shared work_briefs table with kind='consultation_packet'.
 * FACTUAL sections (summary, facts, document status) are assembled deterministically
 * from the grounded PipelineResult; the judgment sections (unresolved questions,
 * suggested agenda) are model-written and framed for the professional.
 */

export interface PacketFact {
  label: string;
  value: string;
  source: string | null;
  carried?: boolean;
}
/**
 * The packet answers a different question from the Initial Work Brief: not "what
 * arrived / what's missing / what first" but "we're meeting — how do we use this
 * consultation well". Six meeting-focused sections, plus rulebook attribution.
 */
export interface PacketContent {
  /** Rulebook attribution — closes the loop from onboarding to every artifact. */
  preparedFrom: string;
  /** The professional's optional steer for THIS meeting (null = use the rubric). */
  meetingObjective: string | null;
  /** 1 — why this client is here (a line). */
  whyHere: string;
  /** 2 — what we know that's relevant to the conversation (source-backed). */
  whatWeKnow: PacketFact[];
  /** 3 — what's changed since intake (new replies/facts/documents). Deterministic. */
  changedSinceIntake: string[];
  /** 4 — still uncertain: questions to answer IN the meeting (model). */
  stillUncertain: string[];
  /** 5 — the order to run the meeting (model). */
  suggestedAgenda: string[];
  /** 6 — what this consultation needs to resolve before the next stage (model). */
  decisionsToLeaveWith: string[];
  /** True while the model-written sections (3-6 judgment) are still being prepared. */
  judgmentPending?: boolean;
}

export interface WorkPacket {
  id: string;
  accountId: string;
  matterId: string;
  version: number;
  state: WorkBriefState;
  content: PacketContent;
  sourceHash: string;
  readiness: number;
  costCents: number;
  mocked: boolean;
  createdAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
}

const KIND = "consultation_packet";

// --- Persistence (shared work_briefs table; process-memory fallback) ----------

const globalStore = globalThis as unknown as { __brieflyPackets?: Map<string, WorkPacket> };
const memory: Map<string, WorkPacket> = (globalStore.__brieflyPackets ??= new Map());

interface PacketRow {
  id: string;
  account_id: string;
  matter_id: string;
  version: number;
  state: WorkBriefState;
  content: PacketContent;
  source_hash: string | null;
  readiness: number | null;
  cost_cents: number | null;
  mocked: boolean | null;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  kind: string;
}

/**
 * Coerce persisted content to the current shape. Packets created before the re-cut
 * carried the old five-field shape (matterSummary/keyFacts/documentStatus/
 * unresolvedQuestions); map what maps, default the rest, so old rows render instead
 * of crashing the matter page.
 */
function normalizeContent(c: Record<string, unknown> | null | undefined): PacketContent {
  const o = (c ?? {}) as Record<string, unknown>;
  const arr = (k: string, alt?: string): unknown[] => {
    const v = o[k] ?? (alt ? o[alt] : undefined);
    return Array.isArray(v) ? v : [];
  };
  return {
    preparedFrom: typeof o.preparedFrom === "string" ? o.preparedFrom : "",
    meetingObjective: typeof o.meetingObjective === "string" ? o.meetingObjective : null,
    whyHere: (typeof o.whyHere === "string" ? o.whyHere : (o.matterSummary as string)) ?? "",
    whatWeKnow: arr("whatWeKnow", "keyFacts") as PacketFact[],
    changedSinceIntake: arr("changedSinceIntake") as string[],
    stillUncertain: arr("stillUncertain", "unresolvedQuestions") as string[],
    suggestedAgenda: arr("suggestedAgenda") as string[],
    decisionsToLeaveWith: arr("decisionsToLeaveWith") as string[],
    judgmentPending: o.judgmentPending === true,
  };
}

function rowToPacket(r: PacketRow): WorkPacket {
  return {
    id: r.id,
    accountId: r.account_id,
    matterId: r.matter_id,
    version: r.version,
    state: r.state,
    content: normalizeContent(r.content as unknown as Record<string, unknown>),
    sourceHash: r.source_hash ?? "",
    readiness: r.readiness ?? 0,
    costCents: r.cost_cents ?? 0,
    mocked: r.mocked ?? false,
    createdAt: r.created_at,
    approvedAt: r.approved_at,
    approvedBy: r.approved_by,
  };
}

function packetToRow(p: WorkPacket): PacketRow {
  return {
    id: p.id,
    account_id: p.accountId,
    matter_id: p.matterId,
    version: p.version,
    state: p.state,
    content: p.content,
    source_hash: p.sourceHash,
    readiness: p.readiness,
    cost_cents: p.costCents,
    mocked: p.mocked,
    created_at: p.createdAt,
    approved_at: p.approvedAt,
    approved_by: p.approvedBy,
    kind: KIND,
  };
}

async function savePacket(p: WorkPacket): Promise<void> {
  const db = getSupabase();
  if (!db) {
    memory.set(p.id, p);
    return;
  }
  const { error } = await db.from("work_briefs").upsert(packetToRow(p));
  if (error) throw new Error(`savePacket: ${error.message}`);
}

export async function getLatestPacket(matterId: string): Promise<WorkPacket | null> {
  const db = getSupabase();
  if (!db) {
    return (
      [...memory.values()].filter((p) => p.matterId === matterId).sort((a, b) => b.version - a.version)[0] ??
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
  if (error) throw new Error(`getLatestPacket: ${error.message}`);
  return data?.[0] ? rowToPacket(data[0] as PacketRow) : null;
}

export async function getActivePacket(matterId: string): Promise<WorkPacket | null> {
  const latest = await getLatestPacket(matterId);
  return latest && latest.state !== "superseded" ? latest : null;
}

/** New client info arrived since the packet was compiled — it may be out of date. */
export function isPacketStale(packet: WorkPacket, matter: Matter): boolean {
  if (packet.state === "superseded") return false;
  return packet.sourceHash !== matterSourceHash(matter);
}

// --- Generation ---------------------------------------------------------------

interface AgendaInput {
  rubricName: string;
  vertical: string;
  nextActionIntent: string;
  meetingObjective: string | null;
  summary: string;
  facts: { label: string; value: string }[];
  outstanding: string[];
  changedSinceIntake: string[];
}
interface AgendaOut {
  stillUncertain: string[];
  suggestedAgenda: string[];
  decisionsToLeaveWith: string[];
}

async function draftAgenda(input: AgendaInput): Promise<{ out: AgendaOut; costCents: number }> {
  const facts = input.facts.map((f) => `- ${f.label}: ${f.value}`).join("\n");
  const goal = input.meetingObjective || input.nextActionIntent || "the next step for this matter";
  const objectiveLine = input.meetingObjective
    ? `\n- The professional's objective for THIS meeting: "${input.meetingObjective}" — let it shape the agenda and the decisions.`
    : "";
  const system = `You are preparing a professional to make good use of a client consultation on a "${input.rubricName}" (${input.vertical}) matter. The facts are already assembled elsewhere — write ONLY the three meeting-planning sections, concise and specific to THIS matter and THIS meeting. Do NOT re-list the facts.

RULES:
- No autonomous legal/medical/financial advice — frame everything as "for the professional to consider / confirm / decide with the client".
- stillUncertain: 2-4 questions that genuinely need answering IN the meeting — ambiguities, gaps, or things only the client can confirm. Empty if none.
- suggestedAgenda: exactly 3 short, action-oriented points, in the order to run the meeting, working toward "${goal}". Start each with a verb.
- decisionsToLeaveWith: 2-4 concrete outcomes this consultation must clarify, decide, or agree before the next stage — the results the meeting should produce, not just topics to discuss.
- Reason only from the supplied information; invent nothing.${objectiveLine}`;
  const user = `Matter summary: ${input.summary}
Intended outcome (from the rulebook): ${input.nextActionIntent || "(not set)"}${input.meetingObjective ? `\nProfessional's objective for this meeting: ${input.meetingObjective}` : ""}
Known facts:
${facts || "(none extracted)"}
Still outstanding: ${input.outstanding.length ? input.outstanding.join("; ") : "(nothing outstanding)"}
Changed since intake: ${input.changedSinceIntake.length ? input.changedSinceIntake.join("; ") : "(no change since intake)"}`;
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      stillUncertain: { type: "array", items: { type: "string" } },
      suggestedAgenda: { type: "array", items: { type: "string" } },
      decisionsToLeaveWith: { type: "array", items: { type: "string" } },
    },
    required: ["stillUncertain", "suggestedAgenda", "decisionsToLeaveWith"],
  };
  const { data, costCents } = await jsonCall<AgendaOut>({ system, user, schema, maxTokens: 760 });
  return { out: data, costCents };
}

function mockAgenda(input: AgendaInput): AgendaOut {
  const goal = input.meetingObjective || input.nextActionIntent || "the next step";
  return {
    stillUncertain: ["Confirm the key facts on file with the client at the start of the meeting."],
    suggestedAgenda: [
      "Confirm the client's situation and the key facts already on file.",
      "Work through anything still outstanding or unclear.",
      `Agree the next step toward ${goal}.`,
    ],
    decisionsToLeaveWith: [
      `What is needed to move toward ${goal}.`,
      "Who does what before the next stage, and by when.",
    ],
  };
}

async function runAgenda(input: AgendaInput): Promise<{ out: AgendaOut; costCents: number; mocked: boolean }> {
  if (!isConfigured()) return { out: mockAgenda(input), costCents: 0, mocked: true };
  try {
    const { out, costCents } = await draftAgenda(input);
    return { out, costCents, mocked: false };
  } catch (err) {
    console.error("packet agenda draft failed, using fallback:", err);
    return { out: mockAgenda(input), costCents: 0, mocked: true };
  }
}

function fallbackRubric(result: PipelineResult): Rubric {
  return { id: result.rubricId, name: result.rubricName, vertical: result.vertical, description: "", fields: [], documents: [] };
}

/**
 * Deterministic "what's changed since intake" — reuses the since-review diff engine
 * against the matter's baseline (recorded when the brief was approved / last reviewed).
 * Empty when there's no baseline or nothing has moved.
 */
async function changedSinceIntakeBullets(matter: Matter, rubric: Rubric): Promise<string[]> {
  try {
    const baseline = await getBaselineReview(matter.id);
    if (!baseline) return [];
    const c = computeMatterChanges(matter, baseline.snapshot, rubric);
    if (!c.hasChanges) return [];
    const out: string[] = [];
    if (c.newMessages > 0)
      out.push(`${c.newMessages} new client ${c.newMessages === 1 ? "reply" : "replies"} since intake`);
    for (const f of c.newFacts) out.push(`New — ${f.label}: ${f.value}`);
    for (const f of c.changedFacts) out.push(`Changed — ${f.label}: ${f.oldValue} → ${f.newValue}`);
    for (const d of c.newDocuments) out.push(`Document received — ${d.label}`);
    for (const r of c.resolved) out.push(`Resolved — ${r.label}`);
    return out;
  } catch (err) {
    console.error("changedSinceIntake failed:", err);
    return [];
  }
}

/** The deterministic, source-backed sections — instant, no model. */
export function buildFactualPacket(
  rubric: Rubric,
  result: PipelineResult,
  changedSinceIntake: string[],
  meetingObjective: string | null,
): PacketContent {
  const whatWeKnow: PacketFact[] = result.fields
    .filter((f) => f.present && f.value)
    .map((f) => ({ label: f.label, value: f.value as string, source: f.source, carried: f.carried }));

  return {
    preparedFrom: rubric.name,
    meetingObjective: meetingObjective?.trim() || null,
    whyHere: result.summary,
    whatWeKnow,
    changedSinceIntake,
    stillUncertain: [],
    suggestedAgenda: [],
    decisionsToLeaveWith: [],
    judgmentPending: true,
  };
}

function agendaInput(rubric: Rubric, content: PacketContent, result: PipelineResult): AgendaInput {
  const outstanding = (result.gaps ?? []).map((g) => g.label);
  return {
    rubricName: rubric.name,
    vertical: rubric.vertical,
    nextActionIntent: rubric.nextActionIntent ?? "",
    meetingObjective: content.meetingObjective,
    summary: content.whyHere,
    facts: content.whatWeKnow.slice(0, 24).map((f) => ({ label: f.label, value: f.value })),
    outstanding,
    changedSinceIntake: content.changedSinceIntake,
  };
}

/**
 * Create the packet, persisted as `in_review`. Fast by default (facts only,
 * judgmentPending); the meeting-planning sections complete separately so the useful
 * facts render immediately. `supersede` bumps the version, preserving history.
 * `meetingObjective` is the professional's optional steer for this specific meeting.
 */
export async function createPacketForMatter(
  matter: Matter,
  rubric: Rubric | undefined,
  opts: { supersede?: boolean; withJudgment?: boolean; meetingObjective?: string | null } = {},
): Promise<WorkPacket | null> {
  if (!matter.result) return null;
  const rb = rubric ?? fallbackRubric(matter.result);

  const latest = await getLatestPacket(matter.id);
  if (opts.supersede && latest && latest.state !== "superseded") {
    latest.state = "superseded";
    await savePacket(latest);
  }

  // A refresh keeps the objective the professional already set unless a new one is given.
  const objective = opts.meetingObjective ?? latest?.content.meetingObjective ?? null;
  const changed = await changedSinceIntakeBullets(matter, rb);
  let content = buildFactualPacket(rb, matter.result, changed, objective);
  let costCents = 0;
  let mocked = true;
  if (opts.withJudgment) {
    const { out, costCents: c, mocked: m } = await runAgenda(agendaInput(rb, content, matter.result));
    content = {
      ...content,
      stillUncertain: out.stillUncertain.filter(Boolean),
      suggestedAgenda: out.suggestedAgenda.filter(Boolean),
      decisionsToLeaveWith: out.decisionsToLeaveWith.filter(Boolean),
      judgmentPending: false,
    };
    costCents = c;
    mocked = m;
  }

  const packet: WorkPacket = {
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
  await savePacket(packet);
  return packet;
}

/** Phase two — fill the model-written meeting-planning sections if pending. */
export async function completeJudgmentForPacket(
  matter: Matter,
  rubric: Rubric | undefined,
): Promise<WorkPacket | null> {
  const packet = await getActivePacket(matter.id);
  if (!packet) return null;
  if (!packet.content.judgmentPending) return packet;

  const rb = rubric ?? (matter.result ? fallbackRubric(matter.result) : undefined);
  if (!rb || !matter.result) return packet;
  const { out, costCents, mocked } = await runAgenda(agendaInput(rb, packet.content, matter.result));
  packet.content = {
    ...packet.content,
    stillUncertain: out.stillUncertain.filter(Boolean),
    suggestedAgenda: out.suggestedAgenda.filter(Boolean),
    decisionsToLeaveWith: out.decisionsToLeaveWith.filter(Boolean),
    judgmentPending: false,
  };
  packet.costCents += costCents;
  packet.mocked = mocked;
  await savePacket(packet);
  return packet;
}

/**
 * Idempotent: compile a packet only when there isn't already a live one. Unlike the
 * date-gated original, a packet can be prepared before the consultation is formally
 * booked ("date to be confirmed") — the professional decides when to prepare.
 * `meetingObjective` is the optional per-meeting steer. Best-effort; returns the
 * (existing or new) packet, or null.
 */
export async function ensurePacketForConsultation(
  matter: Matter,
  rubric: Rubric | undefined,
  meetingObjective?: string | null,
): Promise<WorkPacket | null> {
  try {
    if (!matter.result) return null;
    const active = await getActivePacket(matter.id);
    if (active) return active;
    return await createPacketForMatter(matter, rubric, { meetingObjective });
  } catch (err) {
    console.error("ensurePacketForConsultation failed:", err);
    return null;
  }
}

/** Mark the packet reviewed / ready for the meeting. Records who/when. */
export async function reviewPacket(packet: WorkPacket, approverUserId: string | null): Promise<void> {
  packet.state = "approved";
  packet.approvedAt = new Date().toISOString();
  packet.approvedBy = approverUserId;
  await savePacket(packet);
}
