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
  reviewPacket,
  type WorkPacket,
} from "@/lib/consultation-packet";

/**
 * Actions for the Pre-Consultation Packet. Field-based trigger: setting the
 * consultation date compiles the packet. Data-returning — the client renders the
 * result immediately (no revalidatePath in the hot path), the pattern proven in
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
 * Book the consultation and compile the packet. Sets matter.consultationAt, logs
 * the event, then prepares a facts-only packet (fast) which the client renders
 * while the agenda/questions complete separately.
 */
export async function setConsultationDate(matterId: string, isoDateTime: string): Promise<WorkPacket | null> {
  await requireUser();
  const when = new Date(isoDateTime);
  if (Number.isNaN(when.getTime())) return null;

  const { matter, rubric } = await loadMatterAndRubric(matterId);
  if (!matter) return null;

  matter.consultationAt = when.toISOString();
  matter.updatedAt = new Date().toISOString();
  await saveMatter(matter);
  await addEvent(matter.accountId, matter.id, "consultation_set", `Consultation set for ${when.toLocaleString()}`);

  const packet = await ensurePacketForConsultation(matter, rubric);
  if (packet) {
    await addEvent(matter.accountId, matter.id, "packet_created", "Pre-consultation packet prepared");
  }
  return packet;
}

/**
 * Clear the booking. The packet describes the matter, not the date, so it's kept —
 * re-setting a date shows the same (or a refreshed) packet again.
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
