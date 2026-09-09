"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getMatter, saveMatter } from "@/lib/store";
import { getCurrentAccount, DEFAULT_ACCOUNT_ID } from "@/lib/metering";
import { addEvent } from "@/lib/events";
import { rescoreWithRubric } from "@/lib/pipeline";
import { CRIMINAL_RUBRIC } from "@/lib/criminal";

/**
 * A simple, MANUAL control — not a classifier. Switches a matter to the criminal
 * matter type so the Chambers Workflows (File Open, Disclosure Note, Correspondence)
 * are available, by re-extracting the existing submission against the criminal rubric.
 * Deliberately explicit: counsel chooses this; Briefly does not guess the vertical.
 */
export async function enableCriminalWorkflows(matterId: string): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const account = await getCurrentAccount();
  const accountId = account?.id ?? DEFAULT_ACCOUNT_ID;
  const matter = await getMatter(matterId, accountId);
  if (!matter?.result) return { ok: false, error: "Matter not found." };

  // Re-run extraction against the criminal rubric only (no re-classification).
  const result = await rescoreWithRubric(matter.submission ?? "", CRIMINAL_RUBRIC);
  matter.result = result;
  matter.updatedAt = new Date().toISOString();
  await saveMatter(matter);
  await addEvent(matter.accountId, matter.id, "criminal_workflows_enabled", "Switched to Criminal Chambers Workflows");
  revalidatePath(`/matters/${matterId}`);
  return { ok: true };
}
