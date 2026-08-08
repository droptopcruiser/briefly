import { getCurrentAccount, getCurrentMembership } from "./metering";
import { listMatters } from "./store";

/**
 * In-app notification feed: what needs the signed-in user's attention right now,
 * derived from their firm's matters (no separate events table). Powers the header
 * bell. "count" is the badge (act-now items: assigned to you + ready for review).
 */

export type NotifReason = "Assigned to you" | "Ready for review" | "Awaiting client info";

export interface NotifItem {
  id: string;
  clientName: string | null;
  rubricName: string | null;
  reason: NotifReason;
}

const PRIORITY: Record<NotifReason, number> = {
  "Assigned to you": 0,
  "Ready for review": 1,
  "Awaiting client info": 2,
};

export async function getNotifications(): Promise<{ count: number; items: NotifItem[] } | null> {
  const [account, membership] = await Promise.all([getCurrentAccount(), getCurrentMembership()]);
  if (!account || !membership) return null;

  const matters = await listMatters(account.id, { limit: 50 });

  const items: NotifItem[] = [];
  for (const m of matters) {
    let reason: NotifReason | null = null;
    if (m.assignedTo === membership.userId && m.status !== "approved") reason = "Assigned to you";
    else if (m.status === "ready_for_review") reason = "Ready for review";
    else if (m.status === "needs_info") reason = "Awaiting client info";
    if (!reason) continue;
    items.push({
      id: m.id,
      clientName: m.clientName,
      rubricName: m.result?.rubricName ?? null,
      reason,
    });
  }

  // Stable sort keeps recency within each group (matters come recent-first).
  items.sort((a, b) => PRIORITY[a.reason] - PRIORITY[b.reason]);

  const count = items.filter(
    (i) => i.reason === "Assigned to you" || i.reason === "Ready for review",
  ).length;

  return { count, items: items.slice(0, 15) };
}
