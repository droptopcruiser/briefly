"use server";

import { addToWaitlist } from "@/lib/waitlist";

export type WaitlistResult = { ok: boolean; error?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Public waitlist signup (no auth). Captures an email (+ optional note) for
 * people without an invite code. Includes a honeypot field to deter bots.
 */
export async function joinWaitlist(
  _prev: WaitlistResult,
  formData: FormData,
): Promise<WaitlistResult> {
  // Honeypot — bots fill hidden fields; humans don't. Pretend success.
  if (String(formData.get("company") ?? "").trim()) return { ok: true };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email address." };

  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;

  try {
    await addToWaitlist(email, note);
  } catch {
    return { ok: false, error: "Something went wrong — please try again." };
  }
  return { ok: true };
}
