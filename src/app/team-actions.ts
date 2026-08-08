"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/metering";
import { inviteMember, removeMember, revokeInvite } from "@/lib/team";
import { isEmailConfigured, sendEmail, senderFrom } from "@/lib/email";

export type TeamResult = { ok: boolean; error?: string; note?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Where invited teammates sign in. */
const APP_URL = process.env.APP_URL ?? "https://briefly-psi-lake.vercel.app";

/** Email the invited teammate so they know to sign in and join. */
async function sendInviteEmail(
  to: string,
  firmName: string,
  role: "member" | "admin",
): Promise<void> {
  const firm = firmName || "a firm";
  await sendEmail({
    to,
    from: senderFrom(firmName),
    subject: `You've been invited to ${firm} on Briefly`,
    body: `Hi,

${firm} has invited you to join their team on Briefly as ${role === "admin" ? "an admin" : "a member"}.

To accept, sign in with this email address (${to}) at:
${APP_URL}/login

Once you sign in, you'll join the team automatically — no invite code needed.

— Briefly`,
  });
}

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

  // The invite record is what lets them auto-join; the email is a courtesy, so a
  // send failure doesn't fail the invite.
  let note: string | undefined;
  if (isEmailConfigured()) {
    try {
      await sendInviteEmail(email, account.name, role);
    } catch (err) {
      console.error("invite email failed:", err);
      note = "Invite saved, but the notification email couldn't be sent.";
    }
  } else {
    note = "Invite saved. Email isn't configured, so tell them to sign in to join.";
  }

  revalidatePath("/app/team");
  return { ok: true, note };
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
