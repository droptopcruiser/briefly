import { getCurrentAccount, getCurrentMembership } from "./metering";
import { listMatters } from "./store";

/**
 * In-app notification feed: what needs the signed-in user's attention right now,
 * derived from their firm's matters (no separate events table). Powers the header
 * bell. Every item is actionable, so the badge count is just the item count.
 */

export type NotifReason = "Ready for you" | "Ready to send" | "Follow-up ready";

export interface NotifItem {
  id: string;
  clientName: string | null;
  rubricName: string | null;
  reason: NotifReason;
}

const PRIORITY: Record<NotifReason, number> = {
  "Ready for you": 0,
  "Ready to send": 1,
  "Follow-up ready": 2,
};

export async function getNotifications(): Promise<{ count: number; items: NotifItem[] } | null> {
  const account = await getCurrentAccount();
  if (!account) return null;

  const matters = await listMatters(account.id, { limit: 50 });

  const items: NotifItem[] = [];
  for (const m of matters) {
    let reason: NotifReason | null = null;
    if (m.status === "ready_for_you") reason = "Ready for you";
    else if (m.status === "ready_for_review") reason = "Ready to send";
    else if (m.status === "awaiting_client" && m.lastNudgedAt) reason = "Follow-up ready";
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

  return { count: items.length, items: items.slice(0, 15) };
}
