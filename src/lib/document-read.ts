import Anthropic from "@anthropic-ai/sdk";
import { MODEL, usageToCents, isConfigured } from "./anthropic";

/**
 * Read a PDF's CONTENT with Claude and return facts that are traceable to a page.
 *
 * Citations give us 1-indexed page locations, but they are incompatible with
 * forced-JSON output (`output_config.format` → 400). So we ask for a JSON array in
 * plain text, enable citations, then reconcile: parse the concatenated text as JSON
 * for {key,value}, and resolve each value's page from the citation whose cited text
 * overlaps it. Anything we can't ground is returned pageless (the caller decides
 * whether that is usable or a review item). Nothing here approves or merges — that
 * is the caller's job, behind the human gate.
 */

export interface DocFact {
  key: string;
  value: string;
  /** The verbatim snippet Claude cited from the document (grounding). */
  quote: string | null;
  /** 1-indexed page the snippet was found on, or null if unresolved. */
  page: number | null;
}

export interface DocReadResult {
  facts: DocFact[];
  costCents: number;
  /** True when the model's text parsed cleanly as the expected JSON array. */
  parsedCleanly: boolean;
  /** How many page citations the model returned (diagnostic). */
  citationCount: number;
  /** Raw model text — for prototyping/debugging only. */
  rawText: string;
}

export interface DocReadField {
  key: string;
  label: string;
  description?: string;
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

const WORD = /[a-z0-9]{3,}/gi;
function tokens(s: string): Set<string> {
  return new Set((s.toLowerCase().match(WORD) ?? []));
}

/** Resolve a value to its citation page by text overlap (verbatim first, then tokens). */
function resolvePage(
  value: string,
  citations: { cited: string; page: number }[],
): { page: number | null; quote: string | null } {
  const v = value.trim().toLowerCase();
  // 1) Verbatim containment either way.
  for (const c of citations) {
    const cl = c.cited.toLowerCase();
    if (cl.includes(v) || v.includes(cl)) return { page: c.page, quote: c.cited };
  }
  // 2) Best token overlap.
  const vt = tokens(value);
  let best: { page: number; quote: string; score: number } | null = null;
  for (const c of citations) {
    const ct = tokens(c.cited);
    let score = 0;
    for (const t of vt) if (ct.has(t)) score++;
    if (score >= 2 && (!best || score > best.score)) best = { page: c.page, quote: c.cited, score };
  }
  return best ? { page: best.page, quote: best.quote } : { page: null, quote: null };
}

/** The document content block, optionally with citations enabled. */
function docBlock(b64: string, cite: boolean) {
  return {
    type: "document" as const,
    source: { type: "base64" as const, media_type: "application/pdf" as const, data: b64 },
    ...(cite ? { citations: { enabled: true } } : {}),
  };
}

/**
 * Two calls, reconciled — the design the prototype confirmed:
 *   1. Structured extraction (document + JSON schema, NO citations) → clean
 *      {key, value, quote}. Forcing JSON suppresses citations, so we don't ask for
 *      pages here.
 *   2. Citation coverage (document + citations, natural prose quoting the source) →
 *      (cited_text, page). Natural output is what makes the model emit citations.
 * Then each fact's quote is matched to a citation to attach its page. A fact whose
 * page can't be resolved is returned pageless — grounded by its quote, but the
 * caller must treat "no page" as lower confidence.
 */
export async function readDocumentPdf(
  pdfBytes: Uint8Array,
  opts: { fields?: DocReadField[] } = {},
): Promise<DocReadResult> {
  if (!isConfigured()) throw new Error("readDocumentPdf: ANTHROPIC_API_KEY not configured");

  const b64 = Buffer.from(pdfBytes).toString("base64");
  const c = getClient();

  const fieldSpec =
    opts.fields && opts.fields.length
      ? `Extract ONLY these fields when present:\n${opts.fields
          .map((f) => `- ${f.key}: ${f.label}${f.description ? ` — ${f.description}` : ""}`)
          .join("\n")}`
      : "Extract the key identifying facts (names, dates, reference numbers, amounts, addresses, roles, organisations). Use a short lowercase slug for each key.";

  // --- Call 1: structured extraction (no citations) ---
  const extraction = await c.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: `You read a document for a professional and extract grounded facts. Read the attached PDF and return the facts actually present — never infer or invent. For each fact, "quote" is the tightest verbatim snippet of the document text that carries it.

${fieldSpec}`,
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            facts: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  key: { type: "string" },
                  value: { type: "string" },
                  quote: { type: "string" },
                },
                required: ["key", "value", "quote"],
              },
            },
          },
          required: ["facts"],
        },
      },
    },
    messages: [{ role: "user", content: [docBlock(b64, false), { type: "text", text: "Extract the facts now." }] }],
  });

  const extText = extraction.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
  let parsedCleanly = false;
  let extracted: { key: string; value: string; quote: string }[] = [];
  try {
    const parsed = JSON.parse(extText) as { facts?: { key?: string; value?: string; quote?: string }[] };
    if (parsed && Array.isArray(parsed.facts)) {
      parsedCleanly = true;
      extracted = parsed.facts
        .filter((f) => f && f.key && f.value)
        .map((f) => ({ key: String(f.key), value: String(f.value), quote: String(f.quote ?? f.value) }));
    }
  } catch {
    parsedCleanly = false;
  }

  // --- Call 2: citation coverage. Citations attach to NATURAL prose that references
  // the document, not to a raw verbatim quote-dump (confirmed in prototyping). So we
  // ask for a comprehensive natural description that quotes the source for each fact;
  // the model emits page-located citations we then reconcile against call 1. ---
  const cover = await c.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system:
      "Read the attached document and describe ALL of its key facts — names, dates, reference numbers, amounts, addresses, roles, organisations, qualifications, and any other specifics — in complete natural sentences. Quote the exact document wording for each fact so it is grounded to its source. Be comprehensive and cover every section of the document.",
    messages: [{ role: "user", content: [docBlock(b64, true), { type: "text", text: "Describe the document's key facts now." }] }],
  });

  const citations: { cited: string; page: number }[] = [];
  for (const b of cover.content) {
    if (b.type !== "text") continue;
    for (const cit of (b.citations ?? []) as Array<{ type: string; cited_text?: string; start_page_number?: number }>) {
      if (cit.type === "page_location" && cit.cited_text && typeof cit.start_page_number === "number") {
        citations.push({ cited: cit.cited_text, page: cit.start_page_number });
      }
    }
  }

  const facts: DocFact[] = extracted.map((f) => {
    // Keep call 1's tight per-fact quote for display; take only the PAGE from the
    // citation coverage (matched by overlapping the fact's quote).
    const r = resolvePage(f.quote, citations);
    return { key: f.key, value: f.value, quote: f.quote, page: r.page };
  });

  const costCents =
    usageToCents(extraction.usage.input_tokens, extraction.usage.output_tokens) +
    usageToCents(cover.usage.input_tokens, cover.usage.output_tokens);

  return { facts, costCents, parsedCleanly, citationCount: citations.length, rawText: extText };
}
