import Anthropic from "@anthropic-ai/sdk";
import { isConfigured, MODEL } from "./anthropic";
import type { Fixture, HearingType } from "./hearing-prep";

/**
 * Read an attached court-minute PDF and extract the fixture + directions for Hearing
 * Prep. Grounding is strict: it extracts ONLY what the minute states, preserves the
 * page a direction appears on, and when the minute is silent on a field it returns
 * null (never invents a date, court, or task). If it can't read the document at all,
 * `readable` is false and the caller falls back to manual entry.
 */

const TYPES: HearingType[] = ["first_appearance", "callover", "case_review", "sentencing", "trial", "hearing"];

export interface MinuteExtract {
  readable: boolean;
  fixture: Fixture;
  fixtureSource: string | null;
  directions: string[];
}

interface Raw {
  readable: boolean;
  fixtureQuote: string | null;
  fixture: { date: string | null; time: string | null; court: string | null; type: string | null; custody: string | null };
  directions: { text: string; page: number | null }[];
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export async function extractMinuteFromPdf(pdfBytes: Uint8Array): Promise<MinuteExtract> {
  if (!isConfigured()) return { readable: false, fixture: emptyFixture(), fixtureSource: null, directions: [] };
  const b64 = Buffer.from(pdfBytes).toString("base64");
  const system = `You read a criminal court MINUTE (a PDF) and extract only its logistical contents for a barrister's chambers. Extract ONLY what the minute states.

RULES:
- Invent nothing. If the minute does not state a field, return null for it. If the document is not a readable minute, set readable=false.
- NO plea, argument, sentence, or advice — only the fixture and the court's directions.
- fixtureQuote: the verbatim sentence the fixture (date/court) was taken from, if any.
- fixture.type: one of first_appearance, callover, case_review, sentencing, trial, hearing (from the wording) or null.
- fixture.custody: "bail" if remanded on bail, "remand" only if in custody, else null.
- directions: each court direction VERBATIM, with the page number it appears on (or null).`;
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      readable: { type: "boolean" },
      fixtureQuote: { type: ["string", "null"] },
      fixture: {
        type: "object",
        additionalProperties: false,
        properties: {
          date: { type: ["string", "null"] },
          time: { type: ["string", "null"] },
          court: { type: ["string", "null"] },
          type: { type: ["string", "null"] },
          custody: { type: ["string", "null"] },
        },
        required: ["date", "time", "court", "type", "custody"],
      },
      directions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: { text: { type: "string" }, page: { type: ["number", "null"] } },
          required: ["text", "page"],
        },
      },
    },
    required: ["readable", "fixtureQuote", "fixture", "directions"],
  };

  try {
    const res = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1500,
      system,
      output_config: { format: { type: "json_schema", schema } },
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
            { type: "text", text: "Extract the minute's fixture and directions now." },
          ],
        },
      ],
    } as Anthropic.MessageCreateParamsNonStreaming);
    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
    const raw = JSON.parse(text) as Raw;
    if (!raw.readable) return { readable: false, fixture: emptyFixture(), fixtureSource: null, directions: [] };
    const type = raw.fixture.type && (TYPES as string[]).includes(raw.fixture.type) ? (raw.fixture.type as HearingType) : null;
    const custody = raw.fixture.custody === "remand" ? "remand" : raw.fixture.custody === "bail" ? "bail" : null;
    return {
      readable: true,
      fixture: { date: raw.fixture.date, time: raw.fixture.time, court: raw.fixture.court, type, custody },
      fixtureSource: raw.fixtureQuote,
      directions: (raw.directions ?? []).map((d) => (d.page != null ? `${d.text} (minute p.${d.page})` : d.text)),
    };
  } catch (err) {
    console.error("extractMinuteFromPdf failed:", err);
    return { readable: false, fixture: emptyFixture(), fixtureSource: null, directions: [] };
  }
}

function emptyFixture(): Fixture {
  return { date: null, time: null, court: null, type: null, custody: null };
}
