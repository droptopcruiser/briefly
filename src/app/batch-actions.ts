"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { requireAccount } from "@/lib/metering";
import { getMatter, setMatterSnooze } from "@/lib/store";
import { setAssignee } from "@/lib/team";
import { recordReview, deleteLatestReview } from "@/lib/reviews";
import { addEvent } from "@/lib/events";

/**
 * Bulk queue actions — the SAFE ones only. Selecting several matters and clearing
 * them in one pass is convenience; it must never widen what a click can do. So the
 * boundary is hard: bulk Mark-reviewed / Snooze / Assign exist here; bulk send,
 * bulk approve, bulk date-confirmation, and bulk conflict-resolution deliberately
 * do NOT — those stay per-matter with their own gate. Every action writes a
 * per-matter audit event (who, when, which), and each has an inverse for Undo.
 */

/** Mark several queue items as SEEN (records a review baseline per matter). This is
 *  not fact-confirmation, draft-approval, or conflict-resolution — just "reviewed". */
export async function bulkMarkReviewed(ids: string[]): Promise<{ ok: boolean; count: number }> {
  const user = await requireUser();
  const account = await requireAccount();
  let count = 0;
  for (const id of ids) {
    const matter = await getMatter(id, account.id);
    if (!matter) continue;
    await recordReview(matter, user.id);
    await addEvent(account.id, id, "reviewed", "Marked reviewed (bulk)");
    count++;
  }
  revalidatePath("/app");
  return { ok: true, count };
}

/** Undo a bulk Mark-reviewed — removes the latest baseline for each matter. */
export async function bulkUndoReviewed(ids: string[]): Promise<{ ok: boolean }> {
  const account = await requireAccount();
  for (const id of ids) {
    await deleteLatestReview(account.id, id);
    await addEvent(account.id, id, "review_undone", "Review undone (bulk)");
  }
  revalidatePath("/app");
  return { ok: true };
}

/** Snooze several matters for the same duration; returns the shared return date. */
export async function bulkSnooze(ids: string[], days: number): Promise<{ ok: boolean; until: string }> {
  const account = await requireAccount();
  const until = new Date(Date.now() + days * 86_400_000).toISOString();
  for (const id of ids) {
    await setMatterSnooze(account.id, id, until);
    await addEvent(account.id, id, "snoozed", `Snoozed for ${days} ${days === 1 ? "day" : "days"} (bulk)`);
  }
  revalidatePath("/app");
  return { ok: true, until };
}

/** Undo a bulk Snooze — returns each matter to the queue. */
export async function bulkUnsnooze(ids: string[]): Promise<{ ok: boolean }> {
  const account = await requireAccount();
  for (const id of ids) {
    await setMatterSnooze(account.id, id, null);
    await addEvent(account.id, id, "unsnoozed", "Returned to the queue (bulk)");
  }
  revalidatePath("/app");
  return { ok: true };
}

/** Assign several matters to one owner (or unassign). */
export async function bulkAssign(ids: string[], userId: string | null): Promise<{ ok: boolean }> {
  const account = await requireAccount();
  for (const id of ids) {
    await setAssignee(account.id, id, userId || null);
    await addEvent(account.id, id, "assigned", userId ? "Assigned to a teammate (bulk)" : "Unassigned (bulk)");
  }
  revalidatePath("/app");
  return { ok: true };
}

/** Undo a bulk Assign — restore each matter's previous owner. */
export async function restoreAssignments(
  pairs: { id: string; userId: string | null }[],
): Promise<{ ok: boolean }> {
  const account = await requireAccount();
  for (const p of pairs) {
    await setAssignee(account.id, p.id, p.userId || null);
    await addEvent(account.id, p.id, "assigned", "Assignment reverted (bulk undo)");
  }
  revalidatePath("/app");
  return { ok: true };
}
