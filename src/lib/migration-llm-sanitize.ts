import type { MigrationStream, Applicant, Sponsor, Employer, ExtractedField, ApplicantLocation, ApplicantRole } from "./types";
import type { MigrationExtraction } from "./migration-extract";

/**
 * The BARS — the pure guard that turns raw Haiku output into a trustworthy migration
 * profile. Kept type-only so it is headless-testable: the safety promises are proven,
 * not assumed.
 *
 *  - Source-verify: a nationality/location survives only if its quoted source is a real
 *    substring of the email → nothing invented, no false "onshore".
 *  - One principal: the first principal wins; later ones demote (no two principals).
 *  - Party types follow the stream: sponsor only on partner, employer only on AEWV.
 *  - Structural placement: attributes are nested under their party, so a fact can never
 *    land on the wrong person.
 */

export interface LlmApplicant {
  full_name: string;
  role: string;
  nationality?: string | null;
  nationality_source?: string | null;
  location?: string | null;
  location_source?: string | null;
  passport_no?: string | null;
}
export interface LlmOut {
  applicants: LlmApplicant[];
  sponsor?: { full_name: string; status?: string | null } | null;
  employer?: { legal_name: string; nzbn?: string | null } | null;
}

function isQuoted(source: string | null | undefined, submission: string): boolean {
  if (!source) return false;
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return norm(source).length > 0 && norm(submission).includes(norm(source));
}
function toRole(r: string): ApplicantRole {
  return (["principal", "partner", "child", "dependent"].includes(r) ? r : "dependent") as ApplicantRole;
}

export function sanitizeLlm(data: LlmOut, submission: string, stream: MigrationStream): MigrationExtraction {
  const applicants: Applicant[] = [];
  const facts: ExtractedField[] = [];

  for (const a of data.applicants ?? []) {
    if (!a.full_name?.trim()) continue;
    const id = `a${applicants.length + 1}`;
    const hasPrincipal = applicants.some((x) => x.role === "principal");
    let role: ApplicantRole = toRole(a.role);
    if (role === "principal" && hasPrincipal) role = "dependent"; // one principal only
    if (applicants.length === 0) role = "principal"; // first party is the principal
    const nationality = a.nationality?.trim() && isQuoted(a.nationality_source, submission) ? a.nationality.trim() : undefined;
    const loc: ApplicantLocation =
      a.location && ["onshore", "offshore", "unknown"].includes(a.location) && isQuoted(a.location_source, submission)
        ? (a.location as ApplicantLocation)
        : "unknown";
    applicants.push({
      id,
      role,
      fullName: a.full_name.trim(),
      location: loc,
      ...(nationality ? { nationality } : {}),
      ...(a.passport_no?.trim() ? { passportNo: a.passport_no.trim() } : {}),
    });
    if (nationality)
      facts.push({ key: `${id}_nationality`, label: "Nationality", value: nationality, present: true, source: a.nationality_source!.trim(), personId: id });
    if (loc !== "unknown")
      facts.push({ key: `${id}_location`, label: "Location", value: loc, present: true, source: a.location_source!.trim(), personId: id });
  }

  let sponsor: Sponsor | null = null;
  if (stream === "partner" && data.sponsor?.full_name?.trim()) {
    const status = data.sponsor.status === "nz_citizen" || data.sponsor.status === "resident" ? data.sponsor.status : undefined;
    sponsor = { id: "sp", fullName: data.sponsor.full_name.trim(), ...(status ? { status } : {}) };
    if (status) facts.push({ key: "sp_status", label: "Sponsor status", value: status, present: true, source: null, personId: "sp" });
  }

  let employer: Employer | null = null;
  if (stream === "aewv" && data.employer?.legal_name?.trim()) {
    employer = { id: "emp", legalName: data.employer.legal_name.trim(), accreditationStatus: "unknown", ...(data.employer.nzbn?.trim() ? { nzbn: data.employer.nzbn.trim() } : {}) };
  }

  let streamDetail: string | undefined;
  if (stream === "partner") streamDetail = sponsor?.status === "resident" ? "partner_of_resident" : sponsor?.status === "nz_citizen" ? "partner_of_nz_citizen" : undefined;
  if (stream === "aewv") streamDetail = "aewv_worker";

  return { profile: { stream, streamDetail, applicants, sponsor, employer }, facts, gaps: [], dates: [] };
}
