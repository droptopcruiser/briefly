import { SEED_RUBRICS } from "./rubrics";
import { computeGaps, computeReadiness } from "./gaps";
import type {
  Rubric,
  PipelineResult,
  ExtractedField,
  TimelineEvent,
  DraftEmail,
} from "./types";

/**
 * Deterministic, key-free stand-in for the real pipeline. It is intentionally
 * simple — keyword classification and regex field-spotting — so the core loop is
 * demoable end-to-end before an ANTHROPIC_API_KEY is configured. Once a key is
 * set, runPipeline() uses the real Haiku-backed stages instead.
 */

function pickRubric(text: string, rubrics: Rubric[]): Rubric {
  const t = text.toLowerCase();
  const score = (r: Rubric) =>
    (r.vertical.toLowerCase().split(/\W+/).filter((w) => w && t.includes(w)).length) +
    (r.name.toLowerCase().split(/\W+/).filter((w) => w.length > 3 && t.includes(w)).length) +
    r.description
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 4 && t.includes(w)).length;
  let best = rubrics[0];
  let bestScore = -1;
  for (const r of rubrics) {
    const s = score(r);
    if (s > bestScore) {
      best = r;
      bestScore = s;
    }
  }
  return best;
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return (m[1] ?? m[0]).trim();
  }
  return null;
}

function guessName(text: string): string | null {
  return firstMatch(text, [
    /\bmy name is ([A-Z][a-z]+(?: [A-Z][a-z]+)+)/,
    /\bI am ([A-Z][a-z]+(?: [A-Z][a-z]+)+)/,
    /\bthis is ([A-Z][a-z]+(?: [A-Z][a-z]+)+)/,
  ]);
}

function guessEmail(text: string): string | null {
  return firstMatch(text, [/[\w.+-]+@[\w-]+\.[\w.-]+/]);
}

function guessDate(text: string): string | null {
  return firstMatch(text, [
    /\b(\d{4}-\d{2}-\d{2})\b/,
    /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b/i,
    /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/,
  ]);
}

/**
 * Very rough field spotting: if a field's label words (or its type's obvious
 * value) appear near the text, mark it present. This is a demo heuristic only.
 */
function spotField(
  text: string,
  rubric: Rubric,
): { fields: ExtractedField[]; documentsPresent: string[] } {
  const lower = text.toLowerCase();
  const name = guessName(text);
  const email = guessEmail(text);
  const date = guessDate(text);

  const fields: ExtractedField[] = rubric.fields.map((f) => {
    let value: string | null = null;
    let source: string | null = null;

    if (f.type === "date" && date) {
      value = date;
    } else if (
      (f.key.includes("name") || f.label.toLowerCase().includes("name")) &&
      name
    ) {
      value = name;
    } else if (f.type === "enum" && f.options) {
      const hit = f.options.find((o) => lower.includes(o.toLowerCase()));
      if (hit) value = hit;
    } else if (f.type === "boolean") {
      if (lower.includes(f.label.toLowerCase())) value = "true";
    } else {
      // Present if a distinctive label word appears in the text.
      const words = f.label.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
      if (words.some((w) => lower.includes(w))) {
        const sentence = text
          .split(/(?<=[.!?])\s+/)
          .find((s) => words.some((w) => s.toLowerCase().includes(w)));
        value = sentence ? sentence.trim().slice(0, 120) : f.label;
      }
    }

    if (value) source = "(matched in submission)";
    return { key: f.key, label: f.label, value, present: Boolean(value), source };
  });

  const documentsPresent = rubric.documents
    .filter((d) => {
      const words = d.label.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
      return (
        (lower.includes("attach") || lower.includes("enclosed") || lower.includes("provided")) &&
        words.some((w) => lower.includes(w))
      );
    })
    .map((d) => d.key);

  return { fields, documentsPresent };
}

function buildTimeline(text: string): TimelineEvent[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const events: TimelineEvent[] = [];
  for (const s of sentences) {
    const date = guessDate(s);
    if (date) {
      events.push({ date, description: s.trim().slice(0, 160), source: s.trim().slice(0, 160) });
    }
  }
  return events;
}

export function runMockPipeline(
  submission: string,
  rubrics: Rubric[] = SEED_RUBRICS,
): PipelineResult {
  const rubric = pickRubric(submission, rubrics.length > 0 ? rubrics : SEED_RUBRICS);
  const { fields, documentsPresent } = spotField(submission, rubric);
  const gaps = computeGaps(rubric, fields, documentsPresent);
  const readiness = computeReadiness(rubric, gaps);

  const clientName = guessName(submission);
  const clientEmail = guessEmail(submission);

  let draftEmail: DraftEmail | null = null;
  if (gaps.length > 0) {
    const items = gaps.map((g) => `  • ${g.label}`).join("\n");
    draftEmail = {
      to: clientEmail,
      subject: `Additional information needed for your ${rubric.name.toLowerCase()}`,
      body: `Hi${clientName ? " " + clientName.split(" ")[0] : ""},

Thank you for getting in touch. To proceed with your ${rubric.name.toLowerCase()}, we still need the following:

${items}

Once you send these over we can move ahead.

Best regards,
The team

[Draft generated in demo mode — set ANTHROPIC_API_KEY for live drafting.]`,
    };
  }

  const summary =
    `Demo-mode intake for a ${rubric.name} (${rubric.vertical}). ` +
    `${fields.filter((f) => f.present).length} of ${rubric.fields.length} fields detected.`;

  return {
    rubricId: rubric.id,
    rubricName: rubric.name,
    vertical: rubric.vertical,
    classificationConfidence: 0.6,
    clientName,
    clientEmail,
    summary,
    fields,
    timeline: buildTimeline(submission),
    documentsPresent,
    gaps,
    readiness,
    draftEmail,
    costCents: 0,
    mocked: true,
  };
}
