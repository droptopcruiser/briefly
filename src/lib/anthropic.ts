import Anthropic from "@anthropic-ai/sdk";

/**
 * Thin wrapper around the Anthropic SDK for Briefly's pipeline.
 *
 * Each pipeline stage is a discrete, inspectable model call that returns
 * schema-validated JSON. We use a Haiku-class model — extraction cost must stay
 * at a fraction of a cent per matter (see PRD §8).
 *
 * When no ANTHROPIC_API_KEY is configured the module reports `configured: false`
 * so the pipeline can fall back to a deterministic mock, keeping the core loop
 * demoable without keys.
 */

export const MODEL = process.env.BRIEFLY_MODEL ?? "claude-haiku-4-5";

// Haiku 4.5 pricing, USD per 1M tokens.
const INPUT_COST_PER_MTOK = 1.0;
const OUTPUT_COST_PER_MTOK = 5.0;

let client: Anthropic | null = null;

export function isConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

/** Convert token usage into a cost in cents. */
export function usageToCents(inputTokens: number, outputTokens: number): number {
  const dollars =
    (inputTokens / 1_000_000) * INPUT_COST_PER_MTOK +
    (outputTokens / 1_000_000) * OUTPUT_COST_PER_MTOK;
  return dollars * 100;
}

export interface JsonCallResult<T> {
  data: T;
  costCents: number;
}

/**
 * Make one structured-output call. The response is constrained to `schema`
 * (JSON Schema), so the returned text is guaranteed-parseable JSON.
 */
export async function jsonCall<T>(opts: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<JsonCallResult<T>> {
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 2048,
    system: opts.system,
    output_config: { format: { type: "json_schema", schema: opts.schema } },
    messages: [{ role: "user", content: opts.user }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Model returned no text content");
  }

  const data = JSON.parse(textBlock.text) as T;
  const costCents = usageToCents(
    response.usage.input_tokens,
    response.usage.output_tokens,
  );
  return { data, costCents };
}
