"use server";

import { requireUser } from "@/lib/auth";
import { getMatter } from "@/lib/store";
import { getCurrentAccount, DEFAULT_ACCOUNT_ID } from "@/lib/metering";
import { addEvent } from "@/lib/events";
import { uploadDocument, deleteDocument, getDocument } from "@/lib/documents";

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
