import { jsonCall, isConfigured } from "./anthropic";
import { SEED_RUBRICS } from "./rubrics";
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
  rubrics: Rubric[],
): Promise<{ out: ClassifyOut; costCents: number }> {
  const rubricList = rubrics
    .map(
      (r) => `- id: "${r.id}"\n  name: ${r.name}\n  vertical: ${r.vertical}\n  when: ${r.description}`,
    )
    .join("\n");

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
      rubricId: { type: "string", enum: rubrics.map((r) => r.id) },
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
  const missing = gaps
    .map((g) => {
      const field = rubric.fields.find((f) => f.key === g.key);
      const opts = field?.options?.length ? ` — options: ${field.options.join(", ")}` : "";
      return `- ${g.label}${opts}`;
    })
    .join("\n");

  const system = `You write a short, warm follow-up email as a real person at a small ${rubric.vertical || "professional"} firm, for a "${rubric.name}" enquiry. You're simply asking the client for the few things still needed — nothing more.

VOICE — this matters:
- Sound like a helpful human, never a corporate form letter.
- NEVER use: "we require the following information", "at your earliest convenience", "thank you for your cooperation", "please be advised", "your matter", or a bullet list for a single item.
- If ONE thing is missing, just ask for it in a natural sentence. If a field has options, weave them in so it's easy to answer (e.g. "could you let me know whether it's a house, apartment, townhouse, or land?").
- If a few things are missing, ask for them in a short, friendly way (a brief line, or a tidy short list only if there are several).
- Greet the client by first name if provided. One line of warm context, then the ask, then a brief friendly closing line.
- No advice, opinions, or timelines. Don't invent facts. Plain text only.
- Do NOT add a sign-off, closing salutation, or signature (no "Kind regards", no name) — the firm's own signature is appended automatically.`;

  const user = `Client's first name: ${clientName ? clientName.split(" ")[0] : "(not provided)"}
Still needed from the client:
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

/**
 * Draft a follow-up CHASE for a matter that's gone quiet. `priorChases` = how many
 * chases have already gone out: 0 → "just following up on my previous email"; >=1
 * → acknowledge we've already asked ("just checking in — we're still waiting on…").
 * Aware of the history so it never robotically repeats. No sign-off (appended).
 */
export async function chaseDraft(
  rubric: Rubric,
  clientName: string,
  gaps: Gap[],
  priorChases: number,
): Promise<DraftOut> {
  const missing = gaps
    .map((g) => {
      const field = rubric.fields.find((f) => f.key === g.key);
      const opts = field?.options?.length ? ` — options: ${field.options.join(", ")}` : "";
      return `- ${g.label}${opts}`;
    })
    .join("\n");

  if (!isConfigured()) {
    const first = priorChases === 0;
    const items = gaps.map((g) => `  • ${g.label}`).join("\n");
    const opener = first
      ? "Just following up on my previous email"
      : "Just checking in — we're still waiting on the items below";
    return {
      subject: first ? "Following up — a few details needed" : "Still waiting on a few details",
      body: `Hi${clientName ? " " + clientName.split(" ")[0] : ""},\n\n${opener}. When you have a moment, could you please send:\n\n${items}\n\nOnce we have these we can move forward.\n\n[Draft generated in demo mode — set ANTHROPIC_API_KEY for live drafting.]`,
    };
  }

  const tone =
    priorChases === 0
      ? "This is a gentle nudge on a previous email that hasn't been answered yet. Warmly check back in and ask again for what's still needed."
      : "This is a REPEAT nudge — you've asked before and are still waiting. Acknowledge that kindly ('just checking in', 'still happy to help once you have a moment'). Keep it brief, warm, and never pushy.";

  const system = `You write a short, warm follow-up as a real person at a small ${rubric.vertical || "professional"} firm, chasing the few things still needed for a "${rubric.name}" enquiry.
${tone}

VOICE: sound human, not a form letter. NEVER use "we require the following information", "at your earliest convenience", "thank you for your cooperation", or "your matter". If one thing is missing, ask for it in a natural sentence (weave in any options so it's easy to answer). Greet by first name if provided. No advice, opinions, or timelines. Plain text. Do NOT add a sign-off/salutation/signature (the firm's signature is appended automatically).`;

  const user = `Client's first name: ${clientName ? clientName.split(" ")[0] : "(not provided)"}
Still needed from the client:
${missing}`;

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: { subject: { type: "string" }, body: { type: "string" } },
    required: ["subject", "body"],
  };

  const { data } = await jsonCall<DraftOut>({ system, user, schema, maxTokens: 1024 });
  return data;
}

/**
 * Extract → normalise → gaps → readiness → draft, against a KNOWN rubric (post
 * classification). Shared by the full pipeline and by re-scoring a matter after a
 * client reply.
 */
async function buildResult(
  submission: string,
  rubric: Rubric,
  opts: {
    classificationConfidence: number;
    costBefore: number;
    fallbackName?: string | null;
    fallbackEmail?: string | null;
  },
): Promise<PipelineResult> {
  let costCents = opts.costBefore;

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

  const clientName = ext.clientName?.trim() || opts.fallbackName || null;
  const clientEmail = ext.clientEmail?.trim() || opts.fallbackEmail || null;

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
    classificationConfidence: opts.classificationConfidence,
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

/** Run the full pipeline for one submission against the given rubric set. */
export async function runPipeline(
  submission: string,
  rubrics: Rubric[] = SEED_RUBRICS,
): Promise<PipelineResult> {
  const activeRubrics = rubrics.length > 0 ? rubrics : SEED_RUBRICS;

  if (!isConfigured()) {
    return runMockPipeline(submission, activeRubrics);
  }

  const { out: cls, costCents: c1 } = await classify(submission, activeRubrics);
  const rubric = activeRubrics.find((r) => r.id === cls.rubricId) ?? activeRubrics[0];

  return buildResult(submission, rubric, {
    classificationConfidence: cls.confidence,
    costBefore: c1,
    fallbackName: cls.clientName?.trim() || null,
    fallbackEmail: cls.clientEmail?.trim() || null,
  });
}

/**
 * Re-score a matter against its existing rubric (no re-classification) — used when
 * a client reply is folded in and readiness may have climbed.
 */
export async function rescoreWithRubric(
  submission: string,
  rubric: Rubric,
): Promise<PipelineResult> {
  if (!isConfigured()) return runMockPipeline(submission, [rubric]);
  return buildResult(submission, rubric, { classificationConfidence: 1, costBefore: 0 });
}
