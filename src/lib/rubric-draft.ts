import { jsonCall, isConfigured } from "./anthropic";
import type { FieldType } from "./types";

/**
 * The rulebook translator — Briefly's onboarding does to a professional's WORKFLOW
 * DESCRIPTION exactly what it does to a client email: unstructured language in, a
 * structured, SOURCE-BACKED rulebook out.
 *
 * The professional describes one enquiry type in plain English; this proposes a
 * matter-type rubric (facts, documents, what "ready" means, and the next-action
 * intent), and — critically — records the verbatim phrase each requirement was
 * drawn from, and flags anything it INFERRED rather than read. The onboarding UI
 * then shows the sources and asks the professional to confirm the inferred bits.
 * Briefly proposes; the firm owns the decision.
 *
 * When no ANTHROPIC key is configured, this returns a clearly-labelled EXAMPLE
 * (mocked=true) — never dressed up as a real extraction of their words.
 */

export interface DraftField {
  label: string;
  description: string;
  type: FieldType;
  required: boolean;
  options?: string[];
  /** Verbatim phrase in the description this was drawn from ("" if none). */
  source: string;
  /** True when Briefly inferred this rather than reading it — flag for confirmation. */
  inferred: boolean;
}

export interface DraftDocument {
  label: string;
  description: string;
  required: boolean;
  source: string;
  inferred: boolean;
}

export interface DraftRubric {
  name: string;
  vertical: string;
  description: string;
  fields: DraftField[];
  documents: DraftDocument[];
  /** "When this matter is ready, what should Briefly prepare?" — intent, not execution. */
  nextActionIntent: string;
  /** True when this is a keyless EXAMPLE, not a live translation of their words. */
  mocked: boolean;
}

/** Pre-fill prompts per practice area — a primer, not a template. Their own words win. */
export const PRACTICE_EXAMPLES: { key: string; label: string; hint: string; example: string }[] = [
  {
    key: "property",
    label: "Property",
    hint: "Property / real estate — appraisals, listings, viewings, tenancies.",
    example:
      "When a new property appraisal enquiry comes in, we need the property address, the owner's details, the property type, their expected timing, and a preferred inspection time. If we have those, we want to draft an appraisal booking confirmation. If the address or owner details are missing, we ask for them.",
  },
  {
    key: "family_law",
    label: "Family Law",
    hint: "Family law — divorce, separation, custody, property settlement.",
    example:
      "For a new family law enquiry we need the client's name, the other party, the type of matter (divorce, custody, or property settlement), the key dates, and whether there are children. We want a marriage certificate and a financial summary. When it's complete we draft a consultation confirmation. If anything essential is missing we ask the client for it.",
  },
  {
    key: "migration",
    label: "Migration",
    hint: "Migration / immigration — visas, applications, sponsorship.",
    example:
      "For a new visa enquiry we need the applicant's full name and nationality, the visa type they're after, their current status, and any key dates. We usually need a passport and supporting documents. When we have everything we draft a consultation confirmation; if documents are missing we request them.",
  },
  {
    key: "accounting",
    label: "Accounting",
    hint: "Accounting / bookkeeping — onboarding, tax, compliance.",
    example:
      "When a new client wants to onboard, we need their business name and structure, their tax period, whether they're GST/VAT registered, and what services they need. We need access to their accounting software and last year's return. When it's all there we prepare onboarding next steps; if records are missing we ask for them.",
  },
  {
    key: "other",
    label: "Something else",
    hint: "",
    example: "",
  },
];

interface DraftOut {
  name: string;
  vertical: string;
  description: string;
  fields: DraftField[];
  documents: DraftDocument[];
  nextActionIntent: string;
}

const TYPES: FieldType[] = ["string", "date", "number", "boolean", "enum"];

/** Live translation of a plain-language workflow description into a sourced rubric. */
async function translate(description: string, practiceHint?: string): Promise<DraftOut> {
  const system = `You translate a professional's plain-language description of how their firm handles ONE type of client enquiry into a structured "rulebook" (a matter type) for an intake tool.

${practiceHint ? `Context: this firm works in — ${practiceHint}\n` : ""}
STRICT RULES:
- Extract ONLY what the description states or clearly implies. Do NOT invent professional or legal requirements. You structure their process; you do not decide what is legally required.
- For every field and document, quote the exact phrase from the description it was drawn from in "source". If you had to INFER it (it's a sensible guess, not stated), set "inferred": true and "source": "".
- Mark "required": true only for things the description says are needed before the matter can proceed. Otherwise false.
- Be conservative: at most 6 fields and 4 documents. Prefer fewer, clearly-right items over many uncertain ones.
- IMPORTANT: a sentence about chasing/asking the client for MISSING information (e.g. "if the address is missing we ask for it", "we request", "we follow up for") describes the follow-up behaviour — it is NOT a document or a field. NEVER invent a "confirmation" document or field from such a sentence. Only include documents that are real files/evidence the client provides (e.g. passport, proof of ownership, bank statement).
- "type" is one of: string | date | number | boolean | enum. Use "enum" only when the description lists a fixed set of options (put them in "options").
- name: a short matter-type name (e.g. "Property Appraisal"). vertical: a one-word area (e.g. "Property"). description: one sentence describing when this matter type applies (used for classification).
- nextActionIntent: a short label for what the firm wants prepared once the matter is ready (e.g. "appraisal booking confirmation", "consultation confirmation"). This is an intended next step, not something you execute.`;

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string" },
      vertical: { type: "string" },
      description: { type: "string" },
      fields: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: { type: "string" },
            description: { type: "string" },
            type: { type: "string", enum: TYPES },
            required: { type: "boolean" },
            options: { type: "array", items: { type: "string" } },
            source: { type: "string" },
            inferred: { type: "boolean" },
          },
          required: ["label", "description", "type", "required", "source", "inferred"],
        },
      },
      documents: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: { type: "string" },
            description: { type: "string" },
            required: { type: "boolean" },
            source: { type: "string" },
            inferred: { type: "boolean" },
          },
          required: ["label", "description", "required", "source", "inferred"],
        },
      },
      nextActionIntent: { type: "string" },
    },
    required: ["name", "vertical", "description", "fields", "documents", "nextActionIntent"],
  };

  const { data } = await jsonCall<DraftOut>({
    system,
    user: description,
    schema,
    maxTokens: 1600,
  });
  return data;
}

/** A deterministic, clearly-labelled EXAMPLE for demo mode (no ANTHROPIC key). */
function exampleRubric(practiceHint?: string): DraftOut {
  const isProperty = (practiceHint ?? "").toLowerCase().includes("propert");
  const f = (label: string, description: string, type: FieldType, required: boolean): DraftField => ({
    label,
    description,
    type,
    required,
    source: "",
    inferred: true,
  });
  const d = (label: string, description: string, required: boolean): DraftDocument => ({
    label,
    description,
    required,
    source: "",
    inferred: true,
  });

  if (isProperty) {
    return {
      name: "Property Appraisal",
      vertical: "Property",
      description: "A homeowner requesting an appraisal ahead of selling or listing.",
      fields: [
        f("Property address", "The address to be appraised.", "string", true),
        f("Owner details", "Name and contact of the owner.", "string", true),
        f("Property type", "House, apartment, land, etc.", "string", false),
        f("Expected timing", "When they hope to list or sell.", "string", false),
        f("Preferred inspection time", "When they'd like the appraisal.", "string", false),
      ],
      documents: [d("Proof of ownership", "Evidence the enquirer owns the property.", false)],
      nextActionIntent: "appraisal booking confirmation",
    };
  }
  return {
    name: "New Client Enquiry",
    vertical: "General",
    description: "A new client getting in touch about a matter your firm handles.",
    fields: [
      f("Client name", "Full name of the client.", "string", true),
      f("Matter type", "What the enquiry is about.", "string", true),
      f("Key dates", "Any dates relevant to the matter.", "date", false),
    ],
    documents: [d("Supporting documents", "Anything the client should provide.", false)],
    nextActionIntent: "consultation confirmation",
  };
}

/**
 * Propose a rulebook from a plain-language description. Live when an ANTHROPIC key
 * is configured; otherwise a clearly-labelled example (mocked=true).
 */
export async function draftRubricFromDescription(
  description: string,
  practiceHint?: string,
): Promise<DraftRubric> {
  if (!isConfigured()) {
    return { ...exampleRubric(practiceHint), mocked: true };
  }
  try {
    const out = await translate(description.trim(), practiceHint);
    // Normalise: enum options only where relevant; trim caps as a safety net.
    const fields = out.fields.slice(0, 6).map((f) => ({
      ...f,
      options: f.type === "enum" ? (f.options ?? []).filter(Boolean) : undefined,
    }));
    return {
      name: out.name.trim() || "New matter type",
      vertical: out.vertical.trim() || "General",
      description: out.description.trim(),
      fields,
      documents: out.documents.slice(0, 4),
      nextActionIntent: out.nextActionIntent.trim(),
      mocked: false,
    };
  } catch (err) {
    console.error("draftRubricFromDescription failed, using example:", err);
    return { ...exampleRubric(practiceHint), mocked: true };
  }
}
