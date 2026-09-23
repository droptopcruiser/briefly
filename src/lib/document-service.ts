import { randomUUID } from "crypto";
import { PDFDocument } from "pdf-lib";
import type { Matter, Rubric } from "./types";
import {
  downloadDocument,
  updateDocument,
  type MatterDocument,
  type PendingDocFact,
} from "./documents";
import { readDocumentPdf } from "./document-read";
import { addEvent } from "./events";
import { saveMatter } from "./store";
import { isMigrationMatter, principalApplicant } from "./migration";

const titleCase = (s: string) => s.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const tok = (s: string) => s.toLowerCase().split(/\s+/).filter(Boolean);

/**
 * Write a bound passport's bio-page facts onto the person record — but only when the scan
 * REFINES what's there (a fuller name whose current tokens are all present, a first
 * nationality). A different name is a real clash and stays behind Confirm. Returns the
 * keys that were applied (so they leave the confirm list). Mutates matter.result.
 */
function applyPassportIdentity(
  matter: Matter,
  personId: string,
  facts: { key: string; value: string }[],
): Set<string> {
  const applied = new Set<string>();
  const mig = matter.result?.migration;
  if (!mig) return applied;
  const applicant = mig.applicants.find((a) => a.id === personId) ?? null;
  const person = applicant ?? (mig.sponsor?.id === personId ? mig.sponsor : null);
  if (!person) return applied;

  const name = facts.find((f) => f.key === "full_name" && f.value?.trim())?.value.trim();
  if (name) {
    const cur = tok(person.fullName);
    const scan = tok(name);
    // Current tokens all present in the scan → a refinement (e.g. add a middle name). Apply.
    if (cur.length === 0 || cur.every((t) => scan.includes(t))) {
      person.fullName = titleCase(name);
      applied.add("full_name");
      // Principal's name drives the matter title + client record.
      if (applicant && principalApplicant(mig)?.id === applicant.id && matter.result) {
        matter.result.clientName = person.fullName;
        matter.clientName = person.fullName;
      }
    }
  }

  const nat = facts.find((f) => f.key === "nationality" && f.value?.trim())?.value.trim();
  if (nat && applicant) {
    if (!applicant.nationality) {
      applicant.nationality = titleCase(nat);
      applied.add("nationality");
    } else if (applicant.nationality.toLowerCase() === nat.toLowerCase()) {
      applied.add("nationality"); // already on record → drop from confirm, no change
    }
    // else a different nationality → clash → stays behind Confirm
  }
  return applied;
}

type ReadField = { key: string; label: string; description: string };
const F = {
  passport_expiry: { key: "passport_expiry", label: "Passport expiry date", description: "Date of EXPIRY from the passport bio page / MRZ — NOT date of issue, NOT date of birth, NOT place of birth. Return YYYY-MM-DD." } as ReadField,
  full_name: { key: "full_name", label: "Full name", description: "The holder's full name exactly as printed." } as ReadField,
  nationality: { key: "nationality", label: "Nationality", description: "Nationality / citizenship — NOT the passport TYPE letter (e.g. 'P'), NOT place of birth." } as ReadField,
  police_cert_validity: { key: "police_cert_validity", label: "Police certificate date", description: "The issue or valid-until date printed on the police certificate. Return YYYY-MM-DD." } as ReadField,
  emedical_validity: { key: "emedical_validity", label: "Medical date", description: "The date the medical / chest x-ray was completed. Return YYYY-MM-DD." } as ReadField,
};
// A migration document bound to an item → the fields to read from it. A passport gives
// name + nationality + expiry (one read, no re-reading for sport); the others their date.
const DOC_ITEM_FIELDS: Record<string, ReadField[]> = {
  passport: [F.passport_expiry, F.full_name, F.nationality],
  police_cert: [F.police_cert_validity],
  emedical: [F.emedical_validity],
};
// A migration doc with no bound item still reads SAFE passport facts only — never the
// conveyancing rubric (which is what invented a "status" from a passport's TYPE P).
const SAFE_MIG_FIELDS = [F.passport_expiry, F.full_name, F.nationality];
// Date-slot keys — these MERGE onto the board (a cited conflict candidate), so they are
// NOT shown as confirm items (the read already places them; no separate Confirm).
export const MIG_DATE_KEYS = new Set(["passport_expiry", "police_cert_validity", "emedical_validity"]);

/**
 * Read a STORED matter document into pending facts — the one read path shared by
 * the manual "Read now" action and the inbound auto-read. Rubric-targeted, and it
 * never touches the matter: facts land on the document as PENDING, awaiting the
 * human's confirmation (same gate as always).
 *
 * Page guards, because real documents run long:
 *  - Over HARD_MAX_PAGES the model can't read it at all → marked unreadable.
 *  - `autoMaxPages` (auto-read only) leaves a large doc "attached" for a deliberate
 *    manual read, so inbound never silently spends a big read.
 */

export const HARD_MAX_PAGES = 100; // Anthropic PDF ceiling (also ~32MB).
export const AUTO_READ_MAX_PAGES = 30; // above this, inbound stores but doesn't auto-read.

/** Count a PDF's pages (best-effort). Null when it can't be parsed. */
export async function countPdfPages(bytes: Uint8Array): Promise<number | null> {
  try {
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    return pdf.getPageCount();
  } catch {
    return null;
  }
}

export type ReadOutcome =
  | { ok: true; facts: number }
  | { ok: false; reason: "missing" | "too_large" | "skipped_large" | "error"; pages?: number };

export async function readStoredDocument(
  matter: Matter,
  rubric: Rubric | undefined,
  doc: MatterDocument,
  opts: { autoMaxPages?: number } = {},
): Promise<ReadOutcome> {
  if (!matter.result) return { ok: false, reason: "error" };
  const owner = doc.accountId;

  // Migration attachment bound to a passport/medical/police item → read its validity
  // date (into the matching slot); otherwise read the rubric's fields as before.
  const mig = isMigrationMatter(matter.result);
  // Migration: the bound item's fields, else SAFE passport facts — NEVER the
  // conveyancing rubric. Conveyancing: the rubric's fields, as before.
  const fields = mig
    ? (doc.itemKey && DOC_ITEM_FIELDS[doc.itemKey]) || SAFE_MIG_FIELDS
    : (rubric?.fields ?? []).map((f) => ({ key: f.key, label: f.label, description: f.description }));
  const wantKeys = new Set(fields.map((f) => f.key));
  const byKey = new Map(matter.result.fields.map((f) => [f.key, f]));
  const keep = (key: string) => (mig ? wantKeys.has(key) : rubric ? byKey.has(key) : true);

  doc.status = "reading";
  await updateDocument(doc);

  try {
    const bytes = await downloadDocument(doc);
    if (!bytes) {
      doc.status = "unreadable";
      await updateDocument(doc);
      return { ok: false, reason: "missing" };
    }

    const pages = await countPdfPages(bytes);
    doc.pageCount = pages;

    if (pages !== null && pages > HARD_MAX_PAGES) {
      doc.status = "unreadable";
      await updateDocument(doc);
      await addEvent(
        owner,
        doc.matterId,
        "document_read",
        `${doc.fileName} is ${pages} pages — over the ${HARD_MAX_PAGES}-page limit; open it to read the key pages`,
      );
      return { ok: false, reason: "too_large", pages };
    }

    if (opts.autoMaxPages && pages !== null && pages > opts.autoMaxPages) {
      // Too big to auto-read — keep it stored and let the professional trigger it.
      doc.status = "attached";
      await updateDocument(doc);
      await addEvent(
        owner,
        doc.matterId,
        "document_attached",
        `${doc.fileName} is ${pages} pages — large, left for you to read with one click`,
      );
      return { ok: false, reason: "skipped_large", pages };
    }

    const res = await readDocumentPdf(bytes, { fields: fields.length ? fields : undefined });

    // Migration: a passport bound to a person WRITES that person's record when the scan
    // only completes/confirms what's there (a fuller name, a first nationality). A real
    // clash (a different name) stays behind Confirm. Those applied facts leave the
    // confirm list — the record now carries them.
    const appliedKeys = mig && doc.personId ? applyPassportIdentity(matter, doc.personId, res.facts) : new Set<string>();

    const pending: PendingDocFact[] = res.facts
      // Keep rubric-field facts (conveyancing) AND migration validity/safe facts; drop
      // anything already written to the person record.
      .filter((f) => keep(f.key) && !appliedKeys.has(f.key))
      .map((f) => {
        const field = byKey.get(f.key);
        const stated = field?.present && field.value ? field.value : null;
        return {
          id: randomUUID(),
          key: f.key,
          label: fields.find((x) => x.key === f.key)?.label ?? field?.label ?? f.key,
          value: f.value,
          quote: f.quote,
          page: f.page,
          stated,
        };
      });

    if (appliedKeys.size > 0) await saveMatter(matter);
    doc.pendingFacts = pending;
    doc.costCents = res.costCents;
    doc.readAt = new Date().toISOString();
    doc.status = pending.length > 0 ? "read" : "unreadable";
    await updateDocument(doc);
    await addEvent(
      owner,
      doc.matterId,
      "document_read",
      `Read ${doc.fileName} — ${pending.length} fact${pending.length === 1 ? "" : "s"} for your review`,
    );
    return { ok: true, facts: pending.length };
  } catch (err) {
    console.error("readStoredDocument failed:", err);
    doc.status = "attached"; // revert so it can be retried
    await updateDocument(doc);
    return { ok: false, reason: "error" };
  }
}
