import { chaseDraft } from "./pipeline";
import { getEffectiveRubrics } from "./rubric-store";
import { saveMatter } from "./store";
import { addEvent } from "./events";
import { listMembers } from "./team";
import { isEmailConfigured, sendFollowupReadyEmail } from "./email";
import type { Account } from "./metering";
import type { Matter } from "./types";

const APP_URL = process.env.APP_URL ?? "https://briefly-psi-lake.vercel.app";

function daysSince(iso: string): number {
  return Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

/**
 * A matter has gone quiet — regenerate an intelligent chase (aware of prior
 * chases), leave the matter awaiting_client with a pending follow-up, and let the
 * firm know. Never auto-sends: the chase lands in the editable Approve & Send box.
 */
export async function nudgeMatter(account: Account, matter: Matter): Promise<boolean> {
  if (!matter.result?.draftEmail || !matter.clientEmail) return false;

  const rubrics = await getEffectiveRubrics(account.id);
  const rubric = rubrics.find((r) => r.id === matter.result!.rubricId) ?? rubrics[0];
  const daysWaiting = daysSince(matter.updatedAt ?? matter.createdAt);

  const chase = await chaseDraft(
    rubric,
    matter.clientName ?? "",
    matter.result.gaps,
    matter.nudgeCount,
  );

  matter.result.draftEmail = { to: matter.clientEmail, subject: chase.subject, body: chase.body };
  matter.nudgeCount = (matter.nudgeCount ?? 0) + 1;
  matter.lastNudgedAt = new Date().toISOString();
  // Note: we deliberately do NOT bump updatedAt — it tracks the last real activity
  // (last client contact), so "waiting N days" keeps climbing.
  await saveMatter(matter);

  await addEvent(
    matter.accountId,
    matter.id,
    "nudge",
    `Waiting ${daysWaiting} days, no reply — follow-up ready`,
  );

  await notifyFollowupReady(account, matter, daysWaiting);
  return true;
}

async function notifyFollowupReady(
  account: Account,
  matter: Matter,
  daysWaiting: number,
): Promise<void> {
  if (!isEmailConfigured()) return;
  try {
    const members = await listMembers(account.id);
    let to: string | null = null;
    if (matter.assignedTo) {
      to = members.find((m) => m.userId === matter.assignedTo)?.email ?? null;
    }
    if (!to) to = members.find((m) => m.role === "owner")?.email ?? null;
    if (!to) return;
    await sendFollowupReadyEmail(
      to,
      account.name,
      matter.clientName,
      daysWaiting,
      `${APP_URL}/matters/${matter.id}`,
    );
  } catch (err) {
    console.error("notifyFollowupReady failed:", err);
  }
}
