import { jsonCall, isConfigured } from "./anthropic";
import { parseIndexText, type DisclosurePack, type DiscCategory, type DiscStatus } from "./disclosure";

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

async function extractWithModel(text: string): Promise<ExtractOut["items"]> {
  const system = `You convert a criminal disclosure INDEX into structured items for a barrister's chambers. Extract ONLY what is literally on the index — one object per listed item.

RULES:
- Do not invent items, references, or statuses. If the index does not state a status for a line, use "listed" (neutral). Never guess "full" or "withheld".
- category: one of charge, sof (summary of facts), statement, notebook, exhibit, photo, interview, index, withheld, other — chosen from the wording.
- status: one of full, part (part-disclosed / extract), withheld, listed — AS STATED on the index only.
- ref: the item's index number/reference exactly as printed. description: the item's text. pages: a stated page/entry count if given, else null. source: the verbatim index line.`;
  const schema = {
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
            category: { type: "string", enum: ["charge", "sof", "statement", "notebook", "exhibit", "photo", "interview", "index", "withheld", "other"] },
            status: { type: "string", enum: ["full", "part", "withheld", "listed"] },
            pages: { type: ["number", "null"] },
            source: { type: "string" },
          },
          required: ["ref", "description", "category", "status", "pages", "source"],
        },
      },
    },
    required: ["items"],
  };
  const { data } = await jsonCall<ExtractOut>({ system, user: text.slice(0, 8000), schema, maxTokens: 1500 });
  return data.items ?? [];
}

/**
 * Extract a pack from index text. Uses the model when configured (falling back to the
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
