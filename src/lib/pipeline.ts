import { jsonCall, isConfigured } from "./anthropic";
import { SEED_RUBRICS, getRubric } from "./rubrics";
import { computeGaps, computeReadiness } from "./gaps";
import { runMockPipeline } from "./mock";
import type {
  Rubric,
  PipelineResult,
  ExtractedField,
  TimelineEvent,
  Gap,
  DraftEmail,
} from "./types";

/**
 * The agentic loop: Perceive → Reason → Act.
 *
 *   1. classify  — match the submission to a firm rubric        (Perceive/Reason)
 *   2. extract   — pull present facts + a sourced timeline       (Reason)
 *   3. gaps      — compare against rubric requirements (in code) (Reason)
 *   4. readiness — completeness score 0–100 (in code)            (Reason)
 *   5. draft     — follow-up email for missing items             (Act)
 *
 * Grounding rules (PRD §6, Safe Harbour):
 *   - Extraction fills only what is explicitly present; absent = null.
 *   - Gaps and readiness are computed deterministically, never by the model,
 *     so the score can't be fabricated.
 *   - The draft is only produced when something is missing; at 100% the matter
 *     is flagged ready for review and no email is drafted.
 */

interface ClassifyOut {
  rubricId: string;
  confidence: number;
  clientName: string;
  clientEmail: string;
}

interface ExtractedFieldRaw {
  key: string;
  value: string;
  present: boolean;
  source: string;
}

interface ExtractOut {
  summary: string;
  clientName: string;
  clientEmail: string;
  fields: ExtractedFieldRaw[];
  timeline: TimelineEvent[];
  documentsPresent: string[];
}

interface DraftOut {
  subject: string;
  body: string;
}

/** Stage 1 — classify the submission against the firm's rubrics. */
async function classify(
  submission: string,
): Promise<{ out: ClassifyOut; costCents: number }> {
  const rubricList = SEED_RUBRICS.map(
    (r) => `- id: "${r.id}"\n  name: ${r.name}\n  vertical: ${r.vertical}\n  when: ${r.description}`,
  ).join("\n");

  const system = `You are the intake classifier for a professional services firm.
Match the client's submission to exactly one of the firm's matter-type rubrics below.
Pick the single best fit even if imperfect. Report your confidence (0-1).
Also extract the client's name and email IF they are explicitly stated; otherwise return "".
Never invent a name or email.

Rubrics:
${rubricList}`;

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      rubricId: { type: "string", enum: SEED_RUBRICS.map((r) => r.id) },
      confidence: { type: "number" },
      clientName: { type: "string" },
      clientEmail: { type: "string" },
    },
    required: ["rubricId", "confidence", "clientName", "clientEmail"],
  };

  const { data, costCents } = await jsonCall<ClassifyOut>({
    system,
    user: submission,
    schema,
    maxTokens: 256,
  });
  return { out: data, costCents };
}

/** Stage 2 — extract structured facts and a sourced timeline. */
async function extract(
  submission: string,
  rubric: Rubric,
): Promise<{ out: ExtractOut; costCents: number }> {
  const fieldSpec = rubric.fields
    .map(
      (f) =>
        `- key: "${f.key}" (${f.label}${f.required ? ", REQUIRED" : ""}, type ${f.type}${
          f.options ? `, one of: ${f.options.join(" | ")}` : ""
        }): ${f.description}`,
    )
    .join("\n");
  const docSpec = rubric.documents
    .map((d) => `- key: "${d.key}" (${d.label}${d.required ? ", REQUIRED" : ""}): ${d.description}`)
    .join("\n");

  const system = `You extract structured facts from a client's unstructured submission for a "${rubric.name}" matter.

STRICT GROUNDING RULES:
- Extract ONLY facts explicitly stated in the submission. Never infer, guess, or invent.
- For each field below, if the fact is present set present=true, put the value, and quote the exact snippet it came from in "source". If absent, set present=false, value="", source="".
- Dates: normalise to YYYY-MM-DD when a full date is given; otherwise keep the stated form (e.g. "March 2023").
- Build a chronological timeline of events the client describes; each event MUST quote its source snippet.
- documentsPresent: list the keys of documents the client says they have already provided or attached. If unsure, omit.
- summary: 1-2 neutral sentences describing the matter. No advice, opinions, or predictions.

Fields to extract:
${fieldSpec}

Documents the firm expects:
${docSpec}`;

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      clientName: { type: "string" },
      clientEmail: { type: "string" },
      fields: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            key: { type: "string" },
            value: { type: "string" },
            present: { type: "boolean" },
            source: { type: "string" },
          },
          required: ["key", "value", "present", "source"],
        },
      },
      timeline: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            date: { type: "string" },
            description: { type: "string" },
            source: { type: "string" },
          },
          required: ["date", "description", "source"],
        },
      },
      documentsPresent: { type: "array", items: { type: "string" } },
    },
    required: ["summary", "clientName", "clientEmail", "fields", "timeline", "documentsPresent"],
  };

  const { data, costCents } = await jsonCall<ExtractOut>({
    system,
    user: submission,
    schema,
    maxTokens: 3072,
  });
  return { out: data, costCents };
}

/** Stage 5 — draft a follow-up email requesting exactly the missing items. */
async function draft(
  rubric: Rubric,
  clientName: string,
  gaps: Gap[],
): Promise<{ out: DraftOut; costCents: number }> {
  const missing = gaps.map((g) => `- ${g.label} (${g.kind})`).join("\n");
  const system = `You draft a short, professional follow-up email for a "${rubric.name}" matter.
The email requests EXACTLY the missing items listed — nothing more.
Do NOT give advice, legal/financial opinions, or timelines. Do NOT invent facts.
Address the client by name if provided. Keep it concise and courteous. Plain text only.
Sign off as "The team" (the professional will edit before sending).`;

  const user = `Client name: ${clientName || "(not provided)"}
Missing items to request:
${missing}`;

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      subject: { type: "string" },
      body: { type: "string" },
    },
    required: ["subject", "body"],
  };

  const { data, costCents } = await jsonCall<DraftOut>({
    system,
    user,
    schema,
    maxTokens: 1024,
  });
  return { out: data, costCents };
}

/** Run the full pipeline for one submission. */
export async function runPipeline(submission: string): Promise<PipelineResult> {
  if (!isConfigured()) {
    return runMockPipeline(submission);
  }

  let costCents = 0;

  const { out: cls, costCents: c1 } = await classify(submission);
  costCents += c1;
  const rubric = getRubric(cls.rubricId) ?? SEED_RUBRICS[0];

  const { out: ext, costCents: c2 } = await extract(submission, rubric);
  costCents += c2;

  // Normalise extracted fields against the rubric (ignore stray keys, fill missing).
  const rawByKey = new Map(ext.fields.map((f) => [f.key, f]));
  const fields: ExtractedField[] = rubric.fields.map((rf) => {
    const raw = rawByKey.get(rf.key);
    const present = Boolean(raw?.present && raw.value.trim());
    return {
      key: rf.key,
      label: rf.label,
      value: present ? raw!.value.trim() : null,
      present,
      source: present && raw!.source.trim() ? raw!.source.trim() : null,
    };
  });

  const validDocs = new Set(rubric.documents.map((d) => d.key));
  const documentsPresent = ext.documentsPresent.filter((k) => validDocs.has(k));

  const gaps = computeGaps(rubric, fields, documentsPresent);
  const readiness = computeReadiness(rubric, gaps);

  const clientName = ext.clientName?.trim() || cls.clientName?.trim() || null;
  const clientEmail = ext.clientEmail?.trim() || cls.clientEmail?.trim() || null;

  let draftEmail: DraftEmail | null = null;
  if (gaps.length > 0) {
    const { out: d, costCents: c3 } = await draft(rubric, clientName ?? "", gaps);
    costCents += c3;
    draftEmail = { to: clientEmail, subject: d.subject, body: d.body };
  }

  return {
    rubricId: rubric.id,
    rubricName: rubric.name,
    vertical: rubric.vertical,
    classificationConfidence: cls.confidence,
    clientName,
    clientEmail,
    summary: ext.summary,
    fields,
    timeline: ext.timeline.filter((t) => t.description?.trim()),
    documentsPresent,
    gaps,
    readiness,
    draftEmail,
    costCents,
    mocked: false,
  };
}
