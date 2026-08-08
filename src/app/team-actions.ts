"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/metering";
import { inviteMember, removeMember, revokeInvite } from "@/lib/team";

export type TeamResult = { ok: boolean; error?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Invite a teammate by email (manager only). Shaped for useActionState. */
export async function inviteTeammate(
  _prev: TeamResult,
  formData: FormData,
): Promise<TeamResult> {
  const { account, membership } = await requireManager();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email address." };

  const role = String(formData.get("role") ?? "member") === "admin" ? "admin" : "member";

  try {
    await inviteMember(account.id, email, role, membership.userId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not send invite." };
  }
  revalidatePath("/app/team");
  return { ok: true };
}

/** Remove a member (manager only; never the owner). */
export async function removeTeammate(formData: FormData): Promise<void> {
  const { account } = await requireManager();
  const userId = String(formData.get("userId") ?? "");
  if (userId) await removeMember(account.id, userId);
  revalidatePath("/app/team");
}

/** Revoke a pending invite (manager only). */
export async function revokeTeammateInvite(formData: FormData): Promise<void> {
  const { account } = await requireManager();
  const inviteId = String(formData.get("inviteId") ?? "");
  if (inviteId) await revokeInvite(account.id, inviteId);
  revalidatePath("/app/team");
}
