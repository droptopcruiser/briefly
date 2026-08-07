"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getCurrentAccount, provisionAccount, completeOnboarding } from "@/lib/metering";

export type OnboardResult = { ok: boolean; error?: string };

/** Valid invite codes (comma-separated env). Unset = signup closed. */
function isValidInvite(code: string): boolean {
  const raw = process.env.INVITE_CODES?.trim();
  if (!raw) return false;
  const codes = raw.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean);
  return codes.includes(code.trim().toLowerCase());
}

/**
 * Step 1 — redeem an invite code to provision a trial account for the user.
 * Provisioning is the gated action; a signed-in user without a valid code can't
 * create an account. Idempotent if the user already has one.
 */
export async function redeemInvite(
  _prev: OnboardResult,
  formData: FormData,
): Promise<OnboardResult> {
  const user = await requireUser();

  if (await getCurrentAccount()) {
    revalidatePath("/app/welcome");
    return { ok: true };
  }

  const code = String(formData.get("inviteCode") ?? "");
  if (!isValidInvite(code)) {
    return { ok: false, error: "That invite code isn't valid." };
  }

  try {
    await provisionAccount(user.id);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not create account." };
  }
  revalidatePath("/app/welcome");
  return { ok: true };
}

/**
 * Step 2 — set the firm name, which finishes onboarding (also generates the slug
 * + inbound intake token). On success the user lands on the dashboard.
 */
export async function completeOnboardingAction(
  _prev: OnboardResult,
  formData: FormData,
): Promise<OnboardResult> {
  await requireUser();
  const account = await getCurrentAccount();
  if (!account) {
    return { ok: false, error: "Enter your invite code first." };
  }

  const name = String(formData.get("firmName") ?? "").replace(/["\r\n]/g, "").trim();
  if (!name) return { ok: false, error: "Enter your firm name." };
  if (name.length > 80) return { ok: false, error: "Keep the firm name under 80 characters." };

  try {
    await completeOnboarding(account, name);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save." };
  }
  redirect("/app");
}
