import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";

/**
 * Matter attachments — Slice 1 (plumbing, no AI). Files live in a PRIVATE Supabase
 * Storage bucket in Sydney (residency); records live in the `documents` table. All
 * access is service-role, server-side; the browser never gets a public URL. Mirrors
 * the store.ts pattern: DB when configured, an in-process fallback for keyless dev.
 *
 * `status` is honest about what Briefly has done with the file:
 *   attached   — stored, NOT read (Slice 1 stops here)
 *   reading    — being read (Slice 2)
 *   read       — content read + facts extracted (Slice 2)
 *   unreadable — read attempted, nothing usable (Slice 2)
 */

export type DocumentStatus = "attached" | "reading" | "read" | "unreadable";

/** A fact extracted from a document, AWAITING the professional's confirmation. */
export interface PendingDocFact {
  id: string;
  key: string;
  label: string;
  value: string;
  quote: string | null;
  /** 1-indexed page, or null when image-only/scanned (not page-verified). */
  page: number | null;
  /** The matter field's current value at read time, if any — for a conflict warning. */
  stated: string | null;
}

export interface MatterDocument {
  id: string;
  accountId: string;
  matterId: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  storagePath: string;
  pageCount: number | null;
  status: DocumentStatus;
  readAt: string | null;
  costCents: number;
  createdAt: string;
  /** Extracted facts awaiting confirmation — never merged until the pro confirms. */
  pendingFacts: PendingDocFact[];
}

const BUCKET = "matter-docs";

const globalStore = globalThis as unknown as {
  __brieflyDocs?: Map<string, MatterDocument>;
  __brieflyDocBlobs?: Map<string, Uint8Array>;
};
const memRows: Map<string, MatterDocument> = (globalStore.__brieflyDocs ??= new Map());
const memBlobs: Map<string, Uint8Array> = (globalStore.__brieflyDocBlobs ??= new Map());

interface DocRow {
  id: string;
  account_id: string;
  matter_id: string;
  file_name: string;
  mime: string;
  size_bytes: number;
  storage_path: string;
  page_count: number | null;
  status: DocumentStatus;
  read_at: string | null;
  cost_cents: number | null;
  created_at: string;
  pending_facts: PendingDocFact[] | null;
}

function rowToDoc(r: DocRow): MatterDocument {
  return {
    id: r.id,
    accountId: r.account_id,
    matterId: r.matter_id,
    fileName: r.file_name,
    mime: r.mime,
    sizeBytes: Number(r.size_bytes ?? 0),
    storagePath: r.storage_path,
    pageCount: r.page_count,
    status: r.status,
    readAt: r.read_at,
    costCents: Number(r.cost_cents ?? 0),
    createdAt: r.created_at,
    pendingFacts: Array.isArray(r.pending_facts) ? r.pending_facts : [],
  };
}

function docToRow(d: MatterDocument): DocRow {
  return {
    id: d.id,
    account_id: d.accountId,
    matter_id: d.matterId,
    file_name: d.fileName,
    mime: d.mime,
    size_bytes: d.sizeBytes,
    storage_path: d.storagePath,
    page_count: d.pageCount,
    status: d.status,
    read_at: d.readAt,
    cost_cents: d.costCents,
    created_at: d.createdAt,
    pending_facts: d.pendingFacts,
  };
}

/** A storage-safe file name (the id keeps the path unique regardless). */
function safeName(name: string): string {
  const s = (name || "file").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
  return s || "file";
}

/** Store the bytes in the private bucket and record the document. */
export async function uploadDocument(
  accountId: string,
  matterId: string,
  fileName: string,
  mime: string,
  bytes: Uint8Array,
): Promise<MatterDocument> {
  const id = randomUUID();
  const storagePath = `${accountId}/${matterId}/${id}-${safeName(fileName)}`;
  const doc: MatterDocument = {
    id,
    accountId,
    matterId,
    fileName,
    mime,
    sizeBytes: bytes.byteLength,
    storagePath,
    pageCount: null,
    status: "attached",
    readAt: null,
    costCents: 0,
    createdAt: new Date().toISOString(),
    pendingFacts: [],
  };

  const db = getSupabase();
  if (!db) {
    memBlobs.set(storagePath, bytes);
    memRows.set(id, doc);
    return doc;
  }
  const up = await db.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (up.error) throw new Error(`uploadDocument (storage): ${up.error.message}`);
  const { error } = await db.from("documents").insert(docToRow(doc));
  if (error) {
    // Roll back the orphaned object so storage and the table don't drift.
    await db.storage.from(BUCKET).remove([storagePath]);
    throw new Error(`uploadDocument (row): ${error.message}`);
  }
  return doc;
}

export async function listDocuments(matterId: string): Promise<MatterDocument[]> {
  const db = getSupabase();
  if (!db) {
    return [...memRows.values()]
      .filter((d) => d.matterId === matterId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  const { data, error } = await db
    .from("documents")
    .select("*")
    .eq("matter_id", matterId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listDocuments: ${error.message}`);
  return (data as DocRow[]).map(rowToDoc);
}

export async function getDocument(id: string): Promise<MatterDocument | null> {
  const db = getSupabase();
  if (!db) return memRows.get(id) ?? null;
  const { data, error } = await db.from("documents").select("*").eq("id", id).limit(1);
  if (error) throw new Error(`getDocument: ${error.message}`);
  return data?.[0] ? rowToDoc(data[0] as DocRow) : null;
}

/** Persist status / pending-facts changes on an existing document record. */
export async function updateDocument(doc: MatterDocument): Promise<void> {
  const db = getSupabase();
  if (!db) {
    memRows.set(doc.id, doc);
    return;
  }
  const { error } = await db
    .from("documents")
    .update({
      status: doc.status,
      read_at: doc.readAt,
      cost_cents: doc.costCents,
      page_count: doc.pageCount,
      pending_facts: doc.pendingFacts,
    })
    .eq("id", doc.id);
  if (error) throw new Error(`updateDocument: ${error.message}`);
}

export async function deleteDocument(id: string): Promise<void> {
  const doc = await getDocument(id);
  if (!doc) return;
  const db = getSupabase();
  if (!db) {
    memBlobs.delete(doc.storagePath);
    memRows.delete(id);
    return;
  }
  await db.storage.from(BUCKET).remove([doc.storagePath]);
  const { error } = await db.from("documents").delete().eq("id", id);
  if (error) throw new Error(`deleteDocument: ${error.message}`);
}

/** Fetch the raw bytes — used by Slice 2 (reading) and any streaming route. */
export async function downloadDocument(doc: MatterDocument): Promise<Uint8Array | null> {
  const db = getSupabase();
  if (!db) return memBlobs.get(doc.storagePath) ?? null;
  const { data, error } = await db.storage.from(BUCKET).download(doc.storagePath);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}
