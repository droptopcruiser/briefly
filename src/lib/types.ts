/**
 * Core domain types for Briefly.
 *
 * A Rubric is a firm-authored extraction schema (BYOR). A Matter is one client
 * submission run through the pipeline. PipelineResult is the structured output of
 * the perceive/reason/act loop.
 */

export type FieldType = "string" | "date" | "number" | "boolean" | "enum";

/** A single required (or optional) fact a rubric wants extracted. */
export interface RubricField {
  key: string;
  label: string;
  /** Guidance the extractor uses to find this fact. */
  description: string;
  required: boolean;
  type: FieldType;
  /** Allowed values when type === "enum". */
  options?: string[];
}

/** A document the rubric expects the client to provide. */
export interface RubricDocument {
  key: string;
  label: string;
  description: string;
  required: boolean;
}

/** A firm-authored matter type. The engine is only as good as the rubric. */
export interface Rubric {
  id: string;
  /** Matter-type name, e.g. "Spousal Visa Application". */
  name: string;
  /** Used during classification to match a submission to this rubric. */
  description: string;
  /** Human vertical label, e.g. "Immigration", "Bookkeeping". */
  vertical: string;
  fields: RubricField[];
  documents: RubricDocument[];
  /**
   * When this matter type reaches its ready criteria, prepare an Initial Work
   * Brief for professional review. Undefined = true (the default for every
   * matter type); set false to keep a type at "ready" without a brief. This is
   * the first, deliberately small step of the firm-configurable "what to
   * prepare when ready" model — profession-neutral, no code required.
   */
  prepareBriefWhenReady?: boolean;
  /**
   * When this matter type is ready, what should Briefly prepare next? A short,
   * firm-authored intent label, e.g. "appraisal booking confirmation" or
   * "consultation confirmation". This is the NEXT-ACTION INTENT — the purpose the
   * readiness condition unlocks — captured now; the executable drafting of that
   * specific output grows later (today the two-path follow-up / Initial Work Brief
   * still handles preparation). Not "an action Briefly executes on its own".
   */
  nextActionIntent?: string;
}

/** One extracted fact. Grounding rule: fill only what is explicitly present. */
export interface ExtractedField {
  key: string;
  label: string;
  /** null when the fact is absent from the submission — never invented. */
  value: string | null;
  present: boolean;
  /**
   * For a fact from this submission: the verbatim snippet it was drawn from.
   * For a carried fact: the provenance ("On file from previous matter · … · date").
   */
  source: string | null;
  /** True when this fact was carried forward from a prior matter (not this one). */
  carried?: boolean;
}

/** A chronological event, each tagged to its source snippet. */
export interface TimelineEvent {
  /** ISO date (YYYY-MM-DD) or a partial/relative string; null if undated. */
  date: string | null;
  description: string;
  /** Verbatim snippet the event was drawn from. */
  source: string;
}

/** A missing required field or document. */
export interface Gap {
  key: string;
  label: string;
  kind: "field" | "document";
  reason: string;
}

export interface DraftEmail {
  to: string | null;
  subject: string;
  body: string;
}

/** The full structured output of the pipeline for one submission. */
export interface PipelineResult {
  rubricId: string;
  rubricName: string;
  vertical: string;
  /** 0–1 confidence the classifier had in the rubric match. */
  classificationConfidence: number;
  clientName: string | null;
  clientEmail: string | null;
  summary: string;
  fields: ExtractedField[];
  timeline: TimelineEvent[];
  documentsPresent: string[]; // rubric document keys detected as provided/mentioned
  gaps: Gap[];
  /** 0–100 completeness against the rubric's required items. */
  readiness: number;
  /** null when readiness is 100% (nothing to request). */
  draftEmail: DraftEmail | null;
  /** Estimated model cost for this run, in cents. */
  costCents: number;
  /** True when no Anthropic key was configured and mock output was used. */
  mocked: boolean;
}

/**
 * Matter workflow state — where the matter sits in the professional's workflow.
 * (Distinct from the readiness ASSESSMENT — the rubric completeness score on the
 * result — and from a work artifact's own state; see WorkBrief. "Approved" is
 * deliberately NOT a state — approving is an action in the activity trail.)
 *   preparing        — Briefly is working on it (transient)
 *   ready_for_review — a missing-info follow-up is drafted; review & send it (Path A)
 *   awaiting_client  — the next step is the client's; Briefly has asked
 *   ready_for_you    — matter is ready; an Initial Work Brief awaits your review (Path B)
 *   in_progress      — you approved the brief; the work is underway
 *   completed        — human has finalised the matter
 */
export type MatterStatus =
  | "preparing"
  | "ready_for_review"
  | "awaiting_client"
  | "ready_for_you"
  | "in_progress"
  | "completed";

export interface Matter {
  id: string;
  createdAt: string;
  /** Owning account (metering). */
  accountId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  submission: string;
  result: PipelineResult | null;
  status: MatterStatus;
  /** Set when the human approves; if there's a draft, the follow-up is sent then. */
  approvedAt: string | null;
  /** Team member (user id) this matter is assigned to, or null (unassigned). */
  assignedTo: string | null;
  /** Bumped on every change (reply, approve, assign) so active matters sort first. */
  updatedAt: string | null;
  /** When Briefly last drafted a follow-up chase for a stuck matter (throttle). */
  lastNudgedAt: string | null;
  /** How many chases Briefly has drafted — lets a repeat chase differ from the first. */
  nudgeCount: number;
  /** When the professional has booked the client consultation (field-based trigger
   *  for the Pre-Consultation Packet). Null until set. */
  consultationAt: string | null;
}
