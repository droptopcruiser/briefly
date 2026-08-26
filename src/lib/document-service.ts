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

  const fields = (rubric?.fields ?? []).map((f) => ({
    key: f.key,
    label: f.label,
    description: f.description,
  }));
  const byKey = new Map(matter.result.fields.map((f) => [f.key, f]));

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

    const pending: PendingDocFact[] = res.facts
      .filter((f) => (rubric ? byKey.has(f.key) : true))
      .map((f) => {
        const field = byKey.get(f.key);
        const stated = field?.present && field.value ? field.value : null;
        return {
          id: randomUUID(),
          key: f.key,
          label: field?.label ?? f.key,
          value: f.value,
          quote: f.quote,
          page: f.page,
          stated,
        };
      });

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
