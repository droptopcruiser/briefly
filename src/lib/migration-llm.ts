import { jsonCall } from "./anthropic";
import { extractMigration, type MigrationExtraction } from "./migration-extract";
import { sanitizeLlm, type LlmOut } from "./migration-llm-sanitize";
import type { MigrationStream } from "./types";

/**
 * Guarded Haiku extraction for migration matters — "the model proposes, the code
 * disposes". Haiku reads any real, messily-worded enquiry into the party structure the
 * deterministic extractor produces from hand-coded cues; `sanitizeLlm` (pure, tested)
 * enforces the product's promises:
 *
 *  - No judgment fields in the schema → a genuineness / pay-threshold / English verdict
 *    can never come back as a fact (human_only stays human_only).
 *  - Attributes are NESTED under their party → a fact can't be placed on the wrong person.
 *  - Every nationality / location must quote a real sentence, verified in the sanitizer.
 *  - The stream (book) is the deterministic classifier's, never Haiku's.
 *  - Any failure (no key, error, no applicant) falls back to the deterministic extractor.
 */

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    applicants: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          full_name: { type: "string" },
          role: { type: "string", enum: ["principal", "partner", "child", "dependent"] },
          nationality: { type: ["string", "null"] },
          nationality_source: { type: ["string", "null"] },
          location: { type: ["string", "null"] },
          location_source: { type: ["string", "null"] },
          passport_no: { type: ["string", "null"] },
        },
        required: ["full_name", "role"],
      },
    },
    sponsor: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: { full_name: { type: "string" }, status: { type: ["string", "null"] } },
      required: ["full_name"],
    },
    employer: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: { legal_name: { type: "string" }, nzbn: { type: ["string", "null"] } },
      required: ["legal_name"],
    },
  },
  required: ["applicants"],
} as const;

const SYSTEM = `You read an immigration enquiry for a New Zealand adviser and extract ONLY the people and the plain facts actually stated. This is a preparation tool: never infer, never judge, never invent.

Rules:
- The PRINCIPAL applicant is the person applying (usually the author). Additional applicants are others explicitly included in THIS application.
- The New Zealander partner/spouse is the SPONSOR, not an applicant — unless the text says they are also applying. Put them in "sponsor", never in "applicants".
- A named EMPLOYER (job offer / AEWV) goes in "employer", only when a company is actually named.
- Children only when NAMED. Never invent a person to match "two kids".
- location = the person's CURRENT location. "currently in Auckland" → onshore. A wish to "stay in"/"move to" NZ is NOT a current location. A PLACE OF BIRTH is NOT a current location. If not clearly stated, use "unknown".
- nationality only when stated (e.g. "Chinese passport" → Chinese).
- For every nationality and location you fill, "*_source" MUST be the exact verbatim sentence from the email that states it. If you cannot quote it, leave the value null.
- NEVER output any judgment: whether a relationship is genuine, whether pay meets a threshold, whether English is sufficient, likely outcome. Those are the adviser's and are not requested.`;

/** Guarded Haiku extraction. Throws on model error; caller falls back to deterministic. */
export async function extractMigrationLLM(submission: string, stream: MigrationStream): Promise<MigrationExtraction> {
  const { data } = await jsonCall<LlmOut>({
    system: SYSTEM,
    user: submission,
    schema: SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 1500,
  });
  return sanitizeLlm(data, submission, stream);
}

const firstName = (f: string) => f.trim().split(/\s+/)[0]?.toLowerCase() || f.toLowerCase();

/**
 * Backfill location / nationality that Haiku left blank from the DETERMINISTIC extractor
 * (reliable + cited) — matched by first name. Haiku owns the structure (who's who); the
 * deterministic cues own the two attributes it reads well. This is what makes "currently
 * in Auckland" survive (and, via na:not_onshore, keeps the current-visa item on the list).
 */
function backfill(llm: MigrationExtraction, det: MigrationExtraction): MigrationExtraction {
  const applicants = llm.profile.applicants.map((a) => ({ ...a }));
  const facts = [...llm.facts];
  for (const a of applicants) {
    const d = det.profile.applicants.find((x) => firstName(x.fullName) === firstName(a.fullName));
    if (!d) continue;
    if (a.location === "unknown" && d.location !== "unknown") {
      a.location = d.location;
      const df = det.facts.find((f) => f.personId === d.id && f.label === "Location");
      facts.push({ key: `${a.id}_location`, label: "Location", value: a.location, present: true, source: df?.source ?? null, personId: a.id });
    }
    if (!a.nationality && d.nationality) {
      a.nationality = d.nationality;
      const df = det.facts.find((f) => f.personId === d.id && f.label === "Nationality");
      facts.push({ key: `${a.id}_nationality`, label: "Nationality", value: d.nationality, present: true, source: df?.source ?? null, personId: a.id });
    }
  }
  return { ...llm, profile: { ...llm.profile, applicants }, facts };
}

/**
 * Extract via Haiku, falling back to the deterministic extractor on any failure OR when
 * Haiku finds no applicant (unset > wrong), and backfilling location/nationality Haiku
 * missed. Keyless callers use the deterministic extractor directly and never reach here.
 */
export async function extractMigrationGuarded(submission: string, stream: MigrationStream): Promise<MigrationExtraction> {
  try {
    const llm = await extractMigrationLLM(submission, stream);
    if (llm.profile.applicants.length > 0) return backfill(llm, extractMigration(submission, stream));
  } catch (err) {
    console.error("extractMigrationLLM failed — deterministic fallback:", err);
  }
  return extractMigration(submission, stream);
}
