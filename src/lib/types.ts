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
  /** Migration path: the applicant this fact belongs to (Applicant.id). Absent =
   *  matter-level / shared (e.g. fees, application number). See MigrationProfile. */
  personId?: string;
  /**
   * Set when this fact was confirmed from a read document (not the enquiry text).
   * `page` is null for image-only/scanned PDFs, which can't be page-cited.
   */
  fromDocument?: { fileName: string; page: number | null };
}

/** A chronological event, each tagged to its source snippet. */
export interface TimelineEvent {
  /** ISO date (YYYY-MM-DD) or a partial/relative string; null if undated. */
  date: string | null;
  description: string;
  /** Verbatim snippet the event was drawn from. */
  source: string;
  /** Migration path: the applicant this date belongs to (Applicant.id), or absent
   *  for a matter-level date (lodgement target, PPI due). */
  personId?: string;
}

/** A missing required field or document. */
export interface Gap {
  key: string;
  label: string;
  kind: "field" | "document";
  reason: string;
  /** Migration path: the applicant this gap belongs to (Applicant.id). Absent =
   *  matter-level. A family's gaps MUST stay scoped per person, never flattened. */
  personId?: string;
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
  /** Email-thread continuity so every outbound stays in ONE mailbox conversation
   *  (In-Reply-To / References). Null for form-originated matters. Carried across
   *  re-scores; updated from each inbound message's headers. */
  emailThread?: EmailThread | null;
  /** Migration path only: the stream + people + sponsor/employer + INZ refs. Absent
   *  on non-migration matters. When present, fields/gaps/timeline scope to its
   *  applicants by Applicant.id, and property nouns are hidden in the UI. */
  migration?: MigrationProfile | null;
}

// ── Immigration (NZ) — the migration path's matter shape ──────────────────────
// The keystone of the immigration pivot: a matter is a FAMILY of applicants under a
// visa stream, not a single property file. Every person carries their own documents
// and dates; gaps/facts/dates reference an Applicant by id so readiness never flattens
// a family into one list. Absent on conveyancing matters (fully additive).

/** Visa stream a migration matter runs under. Coarse; the rubric book is chosen by
 *  `streamDetail` ("partner" is not a rubric — partner-of-citizen vs -resident differ). */
export type MigrationStream = "partner" | "aewv" | "student" | "resident" | "visitor";

/** Where the person is when the application is made. */
export type ApplicantLocation = "onshore" | "offshore" | "unknown";

/** A person's role on the matter. Principal is the lead applicant; children/dependents
 *  are applicants too; the NZ partner on a partner stream is the Sponsor, not an applicant. */
export type ApplicantRole = "principal" | "partner" | "child" | "dependent";

/**
 * A person on the matter. Docs, facts, gaps and dates are scoped to their `id`.
 * Visa state (client number, current visa, passport expiry) is PER-APPLICANT, not
 * file-level: on a real family the principal and partner routinely have different INZ
 * client numbers and different current visas. Passport expiry is denormalised here so
 * the dates strip can read it without walking documents.
 */
export interface Applicant {
  id: string;
  role: ApplicantRole;
  fullName: string;
  dob?: string;
  nationality?: string;
  passportNo?: string;
  passportExpiry?: string;
  location: ApplicantLocation;
  inzClientNumber?: string;
  currentVisa?: { type?: string; expiry?: string };
}

/** The NZ partner sponsoring a partner-category application. Evidence of their status
 *  is a rubric item (document_present), never asserted here. First-class, has its own id
 *  so partner-visa gaps ("residence evidence") attach to the sponsor, not an applicant. */
export interface Sponsor {
  id: string;
  fullName: string;
  status?: "nz_citizen" | "resident" | "other";
}

/** The accredited employer on an AEWV matter. First-class, has its own id so AEWV gaps
 *  ("job token", "employment agreement") attach to the employer. The job check/token and
 *  agreement themselves are rubric items scoped to this id, not fields asserted here. */
export interface Employer {
  id: string;
  legalName: string;
  nzbn?: string;
  accreditationStatus?: "unknown" | "accredited" | "in_progress" | "none";
}

/** The migration profile carried on a matter's result (present only on migration matters). */
export interface MigrationProfile {
  stream: MigrationStream;
  /** The book selector, e.g. "partner_of_nz_citizen" | "partner_of_resident" | "aewv_worker". */
  streamDetail?: string;
  /** applicants[0] is the principal; partner (on non-partner streams) + children follow. */
  applicants: Applicant[];
  /** Partner streams: the NZ sponsor. */
  sponsor: Sponsor | null;
  /** AEWV: the accredited employer (one matter — worker in applicants[0], employer here). */
  employer: Employer | null;
  /** File-level INZ application number when one exists (per-person client numbers live on Applicant). */
  applicationNumber?: string;
}

/** What we need to keep an email conversation threaded in the client's mailbox. */
export interface EmailThread {
  /** The base subject of the conversation (leading "Re:"/"Fwd:" stripped). */
  subject: string | null;
  /** Message-ID of the latest inbound message — becomes the next reply's In-Reply-To. */
  messageId: string | null;
  /** The References header chain to carry on the next outbound (space-separated ids). */
  references: string | null;
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

/**
 * Where a matter sits in the professional's DAILY work queue — urgency, not
 * readiness. Derived by the urgency scorer (src/lib/urgency.ts) from dates, new
 * activity since the last review, chase age, and readiness; a firm can also pin a
 * matter to a bucket manually (priorityOverride).
 *   critical — time-sensitive or slipping: act first
 *   review   — new activity landed that hasn't been looked at
 *   waiting  — the next move is the client's
 *   ready    — prepared, awaiting the professional's action
 *   parked   — complete or safely set aside (no action today)
 */
export type QueuePriority = "critical" | "review" | "waiting" | "ready" | "parked";

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
  /** Queue: hide from the Needs Attention queue until this time (a manual snooze).
   *  Null/absent = not snoozed. Backed by matters.snoozed_until (queue.sql). */
  snoozedUntil?: string | null;
  /** Queue: pin this matter to a priority bucket, overriding the computed one.
   *  Null/absent = automatic. Backed by matters.priority_override (queue.sql). */
  priorityOverride?: QueuePriority | null;
}
