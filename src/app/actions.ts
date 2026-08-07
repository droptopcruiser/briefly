"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ingestSubmission } from "@/lib/ingest";
import { getMatter, saveMatter } from "@/lib/store";
import { requireUser } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase-server";
import {
  QuotaExceededError,
  getCurrentAccount,
  updateAccountSettings,
  resolveReplyTo,
  DEFAULT_ACCOUNT_ID,
  type ReplyToMode,
} from "@/lib/metering";
import { isEmailConfigured, sendEmail, senderFrom, composeEmailBody } from "@/lib/email";

/**
 * Create a matter from a raw client submission and run the intake pipeline.
 * On success, redirects to the matter view.
 */
export async function createMatterFromSubmission(formData: FormData): Promise<void> {
  await requireUser();
  const submission = String(formData.get("submission") ?? "").trim();
  if (!submission) return;

  const account = await getCurrentAccount();

  let matter;
  try {
    matter = await ingestSubmission({ submission, account });
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      // Over the monthly cap — the dashboard shows the blocked state.
      revalidatePath("/app");
      redirect("/app");
    }
    throw err;
  }
  revalidatePath("/app");
  redirect(`/matters/${matter.id}`);
}

/**
 * Human approval gate for a matter with nothing to send (100% ready). Marks it
 * approved; no email leaves. Used by the ApproveButton.
 */
export async function approveMatter(formData: FormData): Promise<void> {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const account = await getCurrentAccount();
  const matter = await getMatter(id, account?.id ?? DEFAULT_ACCOUNT_ID);
  if (!matter) return;
  matter.status = "approved";
  matter.approvedAt = new Date().toISOString();
  await saveMatter(matter);
  revalidatePath(`/matters/${id}`);
}

/** Result of an approve-and-send attempt, surfaced back to the client UI. */
export type SendResult = { ok: boolean; error?: string };

/**
 * Human approval gate for a matter that has a drafted follow-up. The click is
 * the gate: on approval Briefly actually sends the draft to the client (via
 * Postmark) and marks the matter approved. If the send fails, the matter is
 * left unapproved and the error is returned so the professional can retry or
 * fall back to their own mail client. Shaped for `useActionState`.
 */
export async function approveAndSendMatter(
  _prev: SendResult,
  formData: FormData,
): Promise<SendResult> {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing matter id." };

  const account = await getCurrentAccount();
  const matter = await getMatter(id, account?.id ?? DEFAULT_ACCOUNT_ID);
  const draft = matter?.result?.draftEmail;
  if (!matter || !draft) return { ok: false, error: "No drafted email to send." };
  if (!draft.to) {
    return {
      ok: false,
      error: "No client email on this matter — send it from your own mail client.",
    };
  }
  if (!isEmailConfigured()) {
    return {
      ok: false,
      error: "Email sending isn't configured yet (POSTMARK_SERVER_TOKEN / MAIL_FROM).",
    };
  }

  // Send as "Briefly on behalf of {Firm}", with the firm's signature appended and
  // replies routed per the account's Reply-To preference.
  const from = senderFrom(account?.name);
  const replyTo = account ? resolveReplyTo(account) ?? undefined : undefined;
  const body = composeEmailBody(draft.body, {
    signature: account?.emailSignature,
    firmName: account?.name,
  });

  try {
    await sendEmail({ to: draft.to, subject: draft.subject, body, from, replyTo });
  } catch (err) {
    return { ok: false, error: `Send failed: ${err instanceof Error ? err.message : "unknown error"}` };
  }

  matter.status = "approved";
  matter.approvedAt = new Date().toISOString();
  await saveMatter(matter);
  revalidatePath(`/matters/${id}`);
  return { ok: true };
}

/** Result of saving account settings, surfaced back to the client UI. */
export type SettingsResult = { ok: boolean; error?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Save the firm's outbound settings: sender name ("Briefly on behalf of {Firm}"),
 * signature/footer, and Reply-To preference. Shaped for `useActionState`.
 */
export async function saveSettings(
  _prev: SettingsResult,
  formData: FormData,
): Promise<SettingsResult> {
  await requireUser();

  const name = String(formData.get("firmName") ?? "").replace(/["\r\n]/g, "").trim();
  if (!name) return { ok: false, error: "Enter a firm name." };
  if (name.length > 80) return { ok: false, error: "Keep the firm name under 80 characters." };

  const signature = String(formData.get("signature") ?? "").trim();
  if (signature.length > 1000) {
    return { ok: false, error: "Keep the signature under 1000 characters." };
  }

  const rawMode = String(formData.get("replyToMode") ?? "");
  const replyToMode: ReplyToMode | null =
    rawMode === "firm" || rawMode === "intake" ? rawMode : null;
  const replyToEmail = String(formData.get("replyToEmail") ?? "").trim();
  if (replyToMode === "firm" && !EMAIL_RE.test(replyToEmail)) {
    return { ok: false, error: "Enter a valid reply-to email address." };
  }

  const account = await getCurrentAccount();
  try {
    await updateAccountSettings(account?.id ?? DEFAULT_ACCOUNT_ID, {
      name,
      emailSignature: signature || null,
      replyToMode,
      replyToEmail: replyToMode === "firm" ? replyToEmail : null,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save." };
  }
  revalidatePath("/app/settings");
  return { ok: true };
}

/** Sign the current user out and return to the public landing page. */
export async function signOut(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/");
}
