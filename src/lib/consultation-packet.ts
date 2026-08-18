import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";
import { jsonCall, isConfigured } from "./anthropic";
import { matterSourceHash, type WorkBriefState } from "./work-brief";
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
export interface DocStatus {
  label: string;
  provided: boolean;
}
export interface PacketContent {
  matterSummary: string;
  keyFacts: PacketFact[];
  documentStatus: DocStatus[];
  unresolvedQuestions: string[];
  suggestedAgenda: string[];
  /** True while the model-written sections are still being prepared. */
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

function rowToPacket(r: PacketRow): WorkPacket {
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
  summary: string;
  facts: { label: string; value: string }[];
}
interface AgendaOut {
  unresolvedQuestions: string[];
  suggestedAgenda: string[];
}

async function draftAgenda(input: AgendaInput): Promise<{ out: AgendaOut; costCents: number }> {
  const facts = input.facts.map((f) => `- ${f.label}: ${f.value}`).join("\n");
  const system = `You are preparing a professional for a client consultation on a "${input.rubricName}" (${input.vertical}) matter. All facts are supplied; write ONLY two judgment sections, concise and specific to THIS matter.

RULES:
- No autonomous legal/medical/financial advice — frame as "for the professional to consider / confirm with the client".
- unresolvedQuestions: 2-4 short points that are ambiguous or worth confirming in the meeting. Empty if genuinely none.
- suggestedAgenda: exactly 3 short, action-oriented agenda points for the meeting, working toward "${input.nextActionIntent || "the next step for this matter"}". Start each with a verb.
- Reason only from the supplied facts; invent nothing.`;
  const user = `Matter summary: ${input.summary}
Intended outcome: ${input.nextActionIntent || "(not set)"}
Known facts:
${facts || "(none extracted)"}`;
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      unresolvedQuestions: { type: "array", items: { type: "string" } },
      suggestedAgenda: { type: "array", items: { type: "string" } },
    },
    required: ["unresolvedQuestions", "suggestedAgenda"],
  };
  const { data, costCents } = await jsonCall<AgendaOut>({ system, user, schema, maxTokens: 640 });
  return { out: data, costCents };
}

function mockAgenda(input: AgendaInput): AgendaOut {
  const goal = input.nextActionIntent || "the next step";
  return {
    unresolvedQuestions: ["Confirm the extracted facts with the client at the start of the meeting."],
    suggestedAgenda: [
      "Review the client's situation and confirm the key facts.",
      "Work through anything still unclear or outstanding.",
      `Agree the next step toward ${goal}.`,
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

/** The deterministic, source-backed sections — instant, no model. */
export function buildFactualPacket(rubric: Rubric, result: PipelineResult): PacketContent {
  const keyFacts: PacketFact[] = result.fields
    .filter((f) => f.present && f.value)
    .map((f) => ({ label: f.label, value: f.value as string, source: f.source, carried: f.carried }));

  const docLabel = new Map(rubric.documents.map((d) => [d.key, d.label]));
  const provided: DocStatus[] = result.documentsPresent.map((k) => ({ label: docLabel.get(k) ?? k, provided: true }));
  const outstanding: DocStatus[] = result.gaps
    .filter((g) => g.kind === "document")
    .map((g) => ({ label: g.label, provided: false }));

  return {
    matterSummary: result.summary,
    keyFacts,
    documentStatus: [...provided, ...outstanding],
    unresolvedQuestions: [],
    suggestedAgenda: [],
    judgmentPending: true,
  };
}

function agendaInput(rubric: Rubric, content: PacketContent, clientFacts: PacketFact[]): AgendaInput {
  return {
    rubricName: rubric.name,
    vertical: rubric.vertical,
    nextActionIntent: rubric.nextActionIntent ?? "",
    summary: content.matterSummary,
    facts: clientFacts.slice(0, 24).map((f) => ({ label: f.label, value: f.value })),
  };
}

/**
 * Create the packet, persisted as `in_review`. Fast by default (facts only,
 * judgmentPending); the agenda/questions complete separately so the useful facts
 * render immediately. `supersede` bumps the version, preserving history.
 */
export async function createPacketForMatter(
  matter: Matter,
  rubric: Rubric | undefined,
  opts: { supersede?: boolean; withJudgment?: boolean } = {},
): Promise<WorkPacket | null> {
  if (!matter.result) return null;
  const rb = rubric ?? fallbackRubric(matter.result);

  const latest = await getLatestPacket(matter.id);
  if (opts.supersede && latest && latest.state !== "superseded") {
    latest.state = "superseded";
    await savePacket(latest);
  }

  let content = buildFactualPacket(rb, matter.result);
  let costCents = 0;
  let mocked = true;
  if (opts.withJudgment) {
    const { out, costCents: c, mocked: m } = await runAgenda(agendaInput(rb, content, content.keyFacts));
    content = { ...content, unresolvedQuestions: out.unresolvedQuestions.filter(Boolean), suggestedAgenda: out.suggestedAgenda.filter(Boolean), judgmentPending: false };
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

/** Phase two — fill the model-written sections of the current packet if pending. */
export async function completeJudgmentForPacket(
  matter: Matter,
  rubric: Rubric | undefined,
): Promise<WorkPacket | null> {
  const packet = await getActivePacket(matter.id);
  if (!packet) return null;
  if (!packet.content.judgmentPending) return packet;

  const rb = rubric ?? (matter.result ? fallbackRubric(matter.result) : undefined);
  if (!rb) return packet;
  const { out, costCents, mocked } = await runAgenda(agendaInput(rb, packet.content, packet.content.keyFacts));
  packet.content = {
    ...packet.content,
    unresolvedQuestions: out.unresolvedQuestions.filter(Boolean),
    suggestedAgenda: out.suggestedAgenda.filter(Boolean),
    judgmentPending: false,
  };
  packet.costCents += costCents;
  packet.mocked = mocked;
  await savePacket(packet);
  return packet;
}

/**
 * Idempotent: compile a packet only when a consultation is booked AND there isn't
 * already a live one. Best-effort. Returns the (existing or new) packet, or null.
 */
export async function ensurePacketForConsultation(
  matter: Matter,
  rubric: Rubric | undefined,
): Promise<WorkPacket | null> {
  try {
    if (!matter.consultationAt || !matter.result) return null;
    const active = await getActivePacket(matter.id);
    if (active) return active;
    return await createPacketForMatter(matter, rubric);
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
