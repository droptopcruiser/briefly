"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ingestSubmission } from "@/lib/ingest";
import { getMatter, saveMatter } from "@/lib/store";

/**
 * Create a matter from a raw client submission and run the intake pipeline.
 * On success, redirects to the matter view.
 */
export async function createMatterFromSubmission(formData: FormData): Promise<void> {
  const submission = String(formData.get("submission") ?? "").trim();
  if (!submission) return;

  const matter = await ingestSubmission({ submission });
  revalidatePath("/");
  redirect(`/matters/${matter.id}`);
}

/**
 * Human approval gate. Marks the matter approved. The AI never sends anything
 * on its own — actually sending the drafted email is Phase 1.5 (FR-12).
 */
export async function approveMatter(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const matter = await getMatter(id);
  if (!matter) return;
  matter.status = "approved";
  matter.approvedAt = new Date().toISOString();
  await saveMatter(matter);
  revalidatePath(`/matters/${id}`);
}
