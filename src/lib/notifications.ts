import { getCurrentAccount } from "./metering";
import { listMatters } from "./store";
import { isMigrationMatter, migrationMatterTitle } from "./migration";
import { computeMigrationUrgency } from "./migration-urgency";

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
  /** Migration: the ladder reason shown in place of the generic NotifReason. */
  reasonText?: string;
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
    const mig = isMigrationMatter(m.result) ? m.result?.migration ?? null : null;
    items.push({
      id: m.id,
      clientName: mig ? migrationMatterTitle(mig).replace(/ \/ (onshore|offshore|unknown)$/, "") : m.clientName,
      rubricName: mig ? null : (m.result?.rubricName ?? null),
      reason,
      reasonText: mig ? computeMigrationUrgency(m, null).reason : undefined,
    });
  }

  // Stable sort keeps recency within each group (matters come recent-first).
  items.sort((a, b) => PRIORITY[a.reason] - PRIORITY[b.reason]);

  return { count: items.length, items: items.slice(0, 15) };
}
