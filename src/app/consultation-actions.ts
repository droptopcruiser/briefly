"use server";

import { requireUser } from "@/lib/auth";
import { getMatter, saveMatter } from "@/lib/store";
import { getCurrentAccount, DEFAULT_ACCOUNT_ID } from "@/lib/metering";
import { getEffectiveRubrics } from "@/lib/rubric-store";
import { addEvent } from "@/lib/events";
import {
  getActivePacket,
  createPacketForMatter,
  completeJudgmentForPacket,
  ensurePacketForConsultation,
  addPromotedAgendaItem,
  reviewPacket,
  type WorkPacket,
} from "@/lib/consultation-packet";
import { hideBriefItem } from "@/lib/work-brief";
import { formatWhen, toWallClock } from "@/lib/format";

/**
 * Actions for the Pre-Consultation Packet. The packet is prepared on demand — a
 * consultation date is optional (a professional may prepare before it's formally
 * booked; "date to be confirmed"). Data-returning — the client renders the result
 * immediately (no revalidatePath in the hot path), the pattern proven in
 * brief-actions.ts. Nothing is sent; the packet is an internal briefing.
 */

async function loadMatterAndRubric(id: string) {
  const account = await getCurrentAccount();
  const accountId = account?.id ?? DEFAULT_ACCOUNT_ID;
  const matter = await getMatter(id, accountId);
  if (!matter?.result) return { matter: null, rubric: undefined };
  const rubrics = await getEffectiveRubrics(matter.accountId);
  const rubric = rubrics.find((r) => r.id === matter.result!.rubricId);
  return { matter, rubric };
}

/**
 * Prepare the packet. The date is optional — pass null to prepare "date to be
 * confirmed". `meetingObjective` is the professional's optional steer for this
 * specific meeting. Compiles a facts-only packet (fast) which the client renders
 * while the meeting-planning sections complete separately.
 */
export async function prepareConsultationPacket(
  matterId: string,
  isoDateTime: string | null,
  meetingObjective: string | null,
): Promise<WorkPacket | null> {
  await requireUser();
  const { matter, rubric } = await loadMatterAndRubric(matterId);
  if (!matter) return null;

  if (isoDateTime) {
    const wall = toWallClock(isoDateTime);
    if (wall) {
      matter.consultationAt = wall;
      matter.updatedAt = new Date().toISOString();
      await saveMatter(matter);
      await addEvent(matter.accountId, matter.id, "consultation_set", `Consultation set for ${formatWhen(wall)}`);
    }
  }

  const packet = await ensurePacketForConsultation(matter, rubric, meetingObjective);
  if (packet) {
    await addEvent(matter.accountId, matter.id, "packet_created", "Pre-consultation packet prepared");
  }
  return packet;
}

/** Set or change the consultation date after the packet exists (no regeneration). */
export async function setConsultationDate(matterId: string, isoDateTime: string): Promise<{ ok: boolean }> {
  await requireUser();
  const wall = toWallClock(isoDateTime);
  if (!wall) return { ok: false };
  const { matter } = await loadMatterAndRubric(matterId);
  if (!matter) return { ok: false };
  matter.consultationAt = wall;
  matter.updatedAt = new Date().toISOString();
  await saveMatter(matter);
  await addEvent(matter.accountId, matter.id, "consultation_set", `Consultation set for ${formatWhen(wall)}`);
  return { ok: true };
}

/**
 * Clear the date only. The packet describes the matter, not the date, so it's kept —
 * it reverts to "date to be confirmed".
 */
export async function clearConsultationDate(matterId: string): Promise<{ ok: boolean }> {
  await requireUser();
  const { matter } = await loadMatterAndRubric(matterId);
  if (!matter) return { ok: false };
  matter.consultationAt = null;
  matter.updatedAt = new Date().toISOString();
  await saveMatter(matter);
  return { ok: true };
}

/** Phase two — fill the packet's agenda + unresolved questions. */
export async function completePacketJudgment(matterId: string): Promise<WorkPacket | null> {
  await requireUser();
  const { matter, rubric } = await loadMatterAndRubric(matterId);
  if (!matter) return null;
  return completeJudgmentForPacket(matter, rubric);
}

/** Refresh — supersede + regenerate from the latest matter state. */
export async function refreshPacket(matterId: string): Promise<WorkPacket | null> {
  await requireUser();
  const { matter, rubric } = await loadMatterAndRubric(matterId);
  if (!matter) return null;
  const packet = await createPacketForMatter(matter, rubric, { supersede: true });
  if (packet) await addEvent(matter.accountId, matter.id, "packet_refreshed", "Pre-consultation packet refreshed");
  return packet;
}

/**
 * Promote a brief item onto the consultation plan's agenda: add it to the plan
 * (creating one if needed) and hide it from the brief, so the item visibly MOVES.
 */
export async function promoteToAgenda(matterId: string, text: string): Promise<{ ok: boolean }> {
  await requireUser();
  const { matter, rubric } = await loadMatterAndRubric(matterId);
  if (!matter) return { ok: false };
  const packet = await addPromotedAgendaItem(matter, rubric, text);
  if (!packet) return { ok: false };
  await hideBriefItem(matterId, text);
  await addEvent(matter.accountId, matter.id, "agenda_promoted", "Added to the consultation plan agenda");
  return { ok: true };
}

/** Dismiss a brief item — hide it from the brief without promoting it. */
export async function dismissBriefItem(matterId: string, text: string): Promise<{ ok: boolean }> {
  await requireUser();
  await hideBriefItem(matterId, text);
  return { ok: true };
}

/** Mark the packet reviewed / ready for the meeting. */
export async function approvePacket(matterId: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const { matter } = await loadMatterAndRubric(matterId);
  if (!matter) return { ok: false };
  const packet = await getActivePacket(matter.id);
  if (!packet || packet.state === "approved") return { ok: true };
  await reviewPacket(packet, user.id);
  await addEvent(matter.accountId, matter.id, "packet_reviewed", "Pre-consultation packet reviewed");
  return { ok: true };
}
