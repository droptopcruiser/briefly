import Anthropic from "@anthropic-ai/sdk";
import { jsonCall, isConfigured, MODEL } from "./anthropic";
import { parseIndexText, type DisclosurePack, type DisclosureItem, type DiscCategory, type DiscStatus } from "./disclosure";

/**
 * Turn a disclosure index (pasted text, or a read document's text) into a structured
 * DisclosurePack — the input the diff + note core needs.
 *
 * Grounding rule: extract only what is literally on the index. Category and status
 * are taken AS STATED; when the line doesn't say, status is "listed" (a neutral fact)
 * — never guessed as disclosed or withheld. The deterministic parser (parseIndexText,
 * in the pure ./disclosure module) handles demo/keyless mode and is the fallback if
 * the model call fails, so ingest always works.
 */

interface ExtractOut {
  items: { ref: string; description: string; category: DiscCategory; status: DiscStatus; pages: number | null; source: string }[];
}

const CATEGORIES: DiscCategory[] = ["charge", "sof", "statement", "notebook", "exhibit", "photo", "interview", "index", "withheld", "other"];
const STATUSES: DiscStatus[] = ["full", "part", "withheld", "listed"];

const INDEX_SYSTEM = `You convert a criminal disclosure INDEX into structured items for a barrister's chambers. Extract ONLY what is literally on the index — one object per listed item.

RULES:
- Do not invent items, references, or statuses. If the index does not state a status for a line, use "listed" (neutral). Never guess "full" or "withheld".
- category: one of charge, sof (summary of facts), statement, notebook, exhibit, photo, interview, index, withheld, other — chosen from the wording.
- status: one of full, part (part-disclosed / extract), withheld, listed — AS STATED on the index only.
- ref: the item's index number/reference exactly as printed. description: the item's text. pages: a stated page/entry count if given, else null. source: the verbatim index line.`;

const ITEMS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          ref: { type: "string" },
          description: { type: "string" },
          category: { type: "string", enum: CATEGORIES },
          status: { type: "string", enum: STATUSES },
          pages: { type: ["number", "null"] },
          source: { type: "string" },
        },
        required: ["ref", "description", "category", "status", "pages", "source"],
      },
    },
  },
  required: ["items"],
};

/** Coerce a model item to a valid DisclosureItem — unknown enums fall back to safe,
 *  neutral defaults ("other" / "listed"), never a guessed disclosure status. */
function normalize(raw: ExtractOut["items"][number]): DisclosureItem {
  return {
    ref: String(raw.ref ?? "").trim() || "?",
    description: String(raw.description ?? "").trim(),
    category: CATEGORIES.includes(raw.category) ? raw.category : "other",
    status: STATUSES.includes(raw.status) ? raw.status : "listed",
    pages: typeof raw.pages === "number" ? raw.pages : null,
    source: raw.source ?? null,
  };
}

async function extractWithModel(text: string): Promise<DisclosureItem[]> {
  const { data } = await jsonCall<ExtractOut>({ system: INDEX_SYSTEM, user: text.slice(0, 8000), schema: ITEMS_SCHEMA, maxTokens: 1500 });
  return (data.items ?? []).map(normalize);
}

/**
 * Extract a pack from index TEXT. Uses the model when configured (falling back to the
 * deterministic parser on any failure), and the parser directly in demo/keyless mode —
 * so ingest is always available and always grounded.
 */
export async function extractPack(
  text: string,
  packNo: number,
  date: string | null,
): Promise<{ pack: DisclosurePack; mocked: boolean }> {
  if (!isConfigured()) return { pack: parseIndexText(text, packNo, date), mocked: true };
  try {
    const items = await extractWithModel(text);
    if (!items.length) return { pack: parseIndexText(text, packNo, date), mocked: true };
    return { pack: { packNo, date, items }, mocked: false };
  } catch (err) {
    console.error("disclosure extractPack model failed, using parser:", err);
    return { pack: parseIndexText(text, packNo, date), mocked: true };
  }
}

// ── Reading the index straight from a PDF ──────────────────────────────────────

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

/**
 * Extract a pack directly from a disclosure-index PDF, so counsel doesn't have to
 * paste the index. Sends the PDF to the model with the same grounded item schema.
 * Requires a configured key; the caller falls back to paste when it can't read.
 */
export async function extractPackFromPdf(
  pdfBytes: Uint8Array,
  packNo: number,
  date: string | null,
): Promise<{ pack: DisclosurePack; mocked: boolean }> {
  if (!isConfigured()) throw new Error("extractPackFromPdf: ANTHROPIC_API_KEY not configured");
  const b64 = Buffer.from(pdfBytes).toString("base64");
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: INDEX_SYSTEM,
    output_config: { format: { type: "json_schema", schema: ITEMS_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
          { type: "text", text: "Extract the disclosure index items now." },
        ],
      },
    ],
  } as Anthropic.MessageCreateParamsNonStreaming);
  const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
  const parsed = JSON.parse(text) as ExtractOut;
  const items = (parsed.items ?? []).map(normalize);
  return { pack: { packNo, date, items }, mocked: false };
}
