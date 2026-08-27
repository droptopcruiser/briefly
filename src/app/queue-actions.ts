"use server";

import { revalidatePath } from "next/cache";
import { requireAccount } from "@/lib/metering";
import { setMatterSnooze, setMatterPriority } from "@/lib/store";
import { addEvent } from "@/lib/events";
import { deleteLatestReview } from "@/lib/reviews";
import type { QueuePriority } from "@/lib/types";

/**
 * Controls for the Needs Attention queue. Each is a targeted, account-scoped
 * mutation that revalidates the dashboard so the queue re-ranks. These persist
 * only once queue.sql has been applied; before that they degrade quietly (the
 * store writer catches the missing-column error) rather than breaking the click.
 */

/** Snooze a matter out of the queue for `days` (hide it until then). */
export async function snoozeMatter(matterId: string, days: number): Promise<{ ok: boolean }> {
  const account = await requireAccount();
  if (!matterId || !(days > 0)) return { ok: false };
  const until = new Date(Date.now() + days * 86_400_000).toISOString();
  await setMatterSnooze(account.id, matterId, until);
  await addEvent(account.id, matterId, "snoozed", `Snoozed for ${days} ${days === 1 ? "day" : "days"}`);
  revalidatePath("/app");
  return { ok: true };
}

/** Bring a snoozed matter back into the queue now. */
export async function unsnoozeMatter(matterId: string): Promise<{ ok: boolean }> {
  const account = await requireAccount();
  if (!matterId) return { ok: false };
  await setMatterSnooze(account.id, matterId, null);
  await addEvent(account.id, matterId, "unsnoozed", "Returned to the queue");
  revalidatePath("/app");
  return { ok: true };
}

/** Undo the last "Confirm review" — restores the prior baseline so the matter
 *  returns to the queue with its since-review diff intact. */
export async function undoReview(matterId: string): Promise<{ ok: boolean }> {
  const account = await requireAccount();
  if (!matterId) return { ok: false };
  await deleteLatestReview(account.id, matterId);
  await addEvent(account.id, matterId, "review_undone", "Review undone");
  revalidatePath("/app");
  revalidatePath(`/matters/${matterId}`);
  return { ok: true };
}

/** Pin a matter to a priority bucket, or pass null to return it to automatic. */
export async function setQueuePriority(
  matterId: string,
  priority: QueuePriority | null,
): Promise<{ ok: boolean }> {
  const account = await requireAccount();
  if (!matterId) return { ok: false };
  await setMatterPriority(account.id, matterId, priority);
  await addEvent(
    account.id,
    matterId,
    "priority_set",
    priority ? `Priority set to ${priority}` : "Priority set to automatic",
  );
  revalidatePath("/app");
  return { ok: true };
}
