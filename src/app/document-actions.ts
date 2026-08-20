"use server";

import { randomUUID } from "crypto";
import { requireUser } from "@/lib/auth";
import { getMatter, saveMatter } from "@/lib/store";
import { getCurrentAccount, DEFAULT_ACCOUNT_ID } from "@/lib/metering";
import { getEffectiveRubrics } from "@/lib/rubric-store";
import { computeGaps, computeReadiness } from "@/lib/gaps";
import { addEvent } from "@/lib/events";
import {
  uploadDocument,
  deleteDocument,
  getDocument,
  updateDocument,
  downloadDocument,
  type PendingDocFact,
} from "@/lib/documents";
import { readDocumentPdf } from "@/lib/document-read";
import { ensureBriefOnReady } from "@/lib/work-brief";

/**
 * Attachment actions — Slice 1. Upload/remove a matter's PDF. Storage is
 * service-role and server-side only; every action verifies matter ownership first.
 * No reading happens here (that's Slice 2) — a file is stored as "attached".
 */

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB — matches next.config server-action limit.

export async function uploadMatterDocument(
  matterId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const account = await getCurrentAccount();
  const accountId = account?.id ?? DEFAULT_ACCOUNT_ID;
  const matter = await getMatter(matterId, accountId);
  if (!matter) return { ok: false, error: "Matter not found." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "No file selected." };
  if (file.type !== "application/pdf") return { ok: false, error: "PDF only for now." };
  if (file.size > MAX_BYTES) return { ok: false, error: "That file is over the 20 MB limit." };

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const owner = matter.accountId ?? accountId;
    const doc = await uploadDocument(owner, matter.id, file.name, file.type, bytes);
    await addEvent(owner, matter.id, "document_attached", `Attached ${doc.fileName}`);
    return { ok: true };
  } catch (err) {
    console.error("uploadMatterDocument failed:", err);
    return { ok: false, error: "Upload failed — please try again." };
  }
}

export async function deleteMatterDocument(
  matterId: string,
  docId: string,
): Promise<{ ok: boolean }> {
  await requireUser();
  const account = await getCurrentAccount();
  const matter = await getMatter(matterId, account?.id ?? DEFAULT_ACCOUNT_ID);
  if (!matter) return { ok: false };
  const doc = await getDocument(docId);
  if (!doc || doc.matterId !== matterId) return { ok: false };
  await deleteDocument(docId);
  return { ok: true };
}

/**
 * READ NOW — manual trigger. Reads the PDF's content (rubric-targeted), stores the
 * extracted facts as PENDING evidence on the document, and DOES NOT touch the matter
 * or its readiness. Facts with no resolved page (image-only/scanned) carry that
 * signal so the drawer can warn "not page-verified".
 */
export async function readMatterDocument(
  matterId: string,
  docId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const account = await getCurrentAccount();
  const accountId = account?.id ?? DEFAULT_ACCOUNT_ID;
  const matter = await getMatter(matterId, accountId);
  if (!matter?.result) return { ok: false, error: "Matter not found." };
  const doc = await getDocument(docId);
  if (!doc || doc.matterId !== matterId) return { ok: false, error: "Document not found." };
  if (doc.mime !== "application/pdf") return { ok: false, error: "PDF only for now." };

  const rubrics = await getEffectiveRubrics(matter.accountId ?? accountId);
  const rubric = rubrics.find((r) => r.id === matter.result!.rubricId);
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
      return { ok: false, error: "Could not read the stored file." };
    }
    const res = await readDocumentPdf(bytes, { fields: fields.length ? fields : undefined });

    // Keep only facts that map to a rubric field (when a rubric exists), so the
    // pending list stays about this firm's requirements, not incidental content.
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
      matter.accountId ?? accountId,
      matter.id,
      "document_read",
      `Read ${doc.fileName} — ${pending.length} fact${pending.length === 1 ? "" : "s"} for your review`,
    );
    return { ok: true };
  } catch (err) {
    console.error("readMatterDocument failed:", err);
    doc.status = "attached"; // revert so it can be retried
    await updateDocument(doc);
    return { ok: false, error: "Reading failed — please try again." };
  }
}

/**
 * CONFIRM a pending document fact. Only on confirm does it touch the matter — and
 * only by filling an EMPTY rubric field. A value that conflicts with what the client
 * stated is NOT overwritten; it's logged as a review item and the stated value
 * stands. Readiness recomputes only when an empty field is actually filled.
 */
export async function confirmDocFact(
  matterId: string,
  docId: string,
  factId: string,
): Promise<{ ok: boolean; outcome?: "merged" | "conflict" | "already" | "extra" }> {
  await requireUser();
  const account = await getCurrentAccount();
  const accountId = account?.id ?? DEFAULT_ACCOUNT_ID;
  const matter = await getMatter(matterId, accountId);
  if (!matter?.result) return { ok: false };
  const doc = await getDocument(docId);
  if (!doc || doc.matterId !== matterId) return { ok: false };
  const fact = doc.pendingFacts.find((f) => f.id === factId);
  if (!fact) return { ok: false };

  const field = matter.result.fields.find((f) => f.key === fact.key);
  let outcome: "merged" | "conflict" | "already" | "extra";
  if (!field) {
    outcome = "extra";
  } else if (!field.present || !field.value) {
    field.value = fact.value;
    field.present = true;
    field.carried = false;
    field.source =
      fact.page !== null
        ? `Document: ${doc.fileName} · p.${fact.page}`
        : `Document: ${doc.fileName} (scan — not page-verified)`;
    field.fromDocument = { fileName: doc.fileName, page: fact.page };
    outcome = "merged";
  } else if (field.value.trim().toLowerCase() === fact.value.trim().toLowerCase()) {
    outcome = "already";
  } else {
    outcome = "conflict";
  }

  const owner = matter.accountId ?? accountId;
  if (outcome === "merged") {
    const rubrics = await getEffectiveRubrics(owner);
    const rubric = rubrics.find((r) => r.id === matter.result!.rubricId);
    if (rubric) {
      matter.result.gaps = computeGaps(rubric, matter.result.fields, matter.result.documentsPresent);
      matter.result.readiness = computeReadiness(rubric, matter.result.gaps);
    }
    // Confirming a document fact can complete the matter — advance it exactly like
    // the pipeline does when a reply makes it ready: flip to "ready for you" and
    // prepare the Initial Work Brief, so the dashboard + workflow reflect it.
    const becameReady =
      matter.result.readiness >= 100 && matter.status === "ready_for_review";
    if (becameReady) matter.status = "ready_for_you";
    matter.updatedAt = new Date().toISOString();
    await saveMatter(matter);
    await addEvent(owner, matter.id, "document_fact_confirmed", `Confirmed ${fact.label} from ${doc.fileName}`);
    if (becameReady) {
      await addEvent(owner, matter.id, "became_ready", "Everything required is now present — ready for review");
      try {
        const brief = await ensureBriefOnReady(matter, rubric);
        if (brief) await addEvent(owner, matter.id, "brief_created", "Initial Work Brief prepared for review");
      } catch (err) {
        console.error("ensureBriefOnReady after doc confirm failed:", err);
      }
    }
  } else if (outcome === "conflict") {
    await addEvent(
      owner,
      matter.id,
      "document_fact_confirmed",
      `${doc.fileName} says ${fact.label}: "${fact.value}" — conflicts with the stated value; left for your review`,
    );
  }

  // The pending item has been handled either way — remove it.
  doc.pendingFacts = doc.pendingFacts.filter((f) => f.id !== factId);
  await updateDocument(doc);
  return { ok: true, outcome };
}

/** REJECT a pending document fact — discard it without touching the matter. */
export async function rejectDocFact(
  matterId: string,
  docId: string,
  factId: string,
): Promise<{ ok: boolean }> {
  await requireUser();
  const account = await getCurrentAccount();
  const matter = await getMatter(matterId, account?.id ?? DEFAULT_ACCOUNT_ID);
  if (!matter) return { ok: false };
  const doc = await getDocument(docId);
  if (!doc || doc.matterId !== matterId) return { ok: false };
  doc.pendingFacts = doc.pendingFacts.filter((f) => f.id !== factId);
  await updateDocument(doc);
  return { ok: true };
}
