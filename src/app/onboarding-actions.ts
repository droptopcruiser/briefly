"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  getCurrentAccount,
  provisionAccount,
  completeOnboarding,
  requireAccount,
} from "@/lib/metering";
import { saveRubric as storeSaveRubric } from "@/lib/rubric-store";
import { draftRubricFromDescription, type DraftRubric } from "@/lib/rubric-draft";
import type { Rubric, FieldType } from "@/lib/types";

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

  const name =
    (user.user_metadata?.name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    null;
  try {
    await provisionAccount(user.id, user.email ?? null, name);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not create account." };
  }
  revalidatePath("/app/welcome");
  return { ok: true };
}

/**
 * Step 2 — set the firm name (also generates the slug + inbound intake token).
 * Unlike before, this does NOT redirect to /app — the guided wizard continues to
 * the rulebook step client-side. Returns ok so the wizard can advance.
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
  // NOTE: no revalidatePath here — revalidating /app/welcome would re-render the
  // server page and fight the client wizard's step state. The wizard advances
  // itself; the account is picked up on the next natural navigation.
  return { ok: true };
}

// ── Step 3: the rulebook translator ──────────────────────────────────────────

function slug(s: string): string {
  return (
    s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "field"
  );
}
function keyer() {
  const used = new Set<string>();
  return (base: string) => {
    let k = base;
    let i = 2;
    while (used.has(k)) k = `${base}_${i++}`;
    used.add(k);
    return k;
  };
}

/** Translate a plain-language workflow description into a proposed, sourced rubric. */
export async function draftRubric(description: string, practiceHint?: string): Promise<DraftRubric> {
  await requireAccount();
  const text = description.trim();
  if (text.length < 12) {
    // Too little to translate — return an example so the UI still has something.
    return draftRubricFromDescription("", practiceHint);
  }
  return draftRubricFromDescription(text, practiceHint);
}

/** The reviewed rubric the professional approves — label-based; keys generated here. */
export interface OnboardRubricInput {
  name: string;
  vertical: string;
  description: string;
  nextActionIntent?: string;
  fields: { label: string; description: string; type: FieldType; required: boolean; options?: string[] }[];
  documents: { label: string; description: string; required: boolean }[];
}

/**
 * Step 3 approval — save the reviewed rulebook as the account's first matter type.
 * Reuses the same key-generation as the rubric editor. No redirect: the wizard
 * advances to the final step.
 */
export async function saveOnboardingRubric(
  input: OnboardRubricInput,
): Promise<OnboardResult> {
  const account = await requireAccount();

  const fieldKey = keyer();
  const fields = input.fields
    .filter((f) => f.label.trim())
    .map((f) => ({
      key: fieldKey(slug(f.label)),
      label: f.label.trim(),
      description: f.description.trim(),
      required: Boolean(f.required),
      type: f.type,
      options:
        f.type === "enum" ? (f.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined,
    }));

  const docKey = keyer();
  const documents = input.documents
    .filter((d) => d.label.trim())
    .map((d) => ({
      key: docKey(slug(d.label)),
      label: d.label.trim(),
      description: d.description.trim(),
      required: Boolean(d.required),
    }));

  if (fields.length === 0 && documents.length === 0) {
    return { ok: false, error: "Add at least one fact or document before activating." };
  }

  const rubric: Rubric = {
    id: randomUUID(),
    name: input.name.trim() || "New matter type",
    vertical: input.vertical.trim() || "General",
    description: input.description.trim(),
    fields,
    documents,
    prepareBriefWhenReady: true,
    nextActionIntent: input.nextActionIntent?.trim() || undefined,
  };

  try {
    await storeSaveRubric(account.id, rubric);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the rulebook." };
  }
  // No revalidatePath — see completeOnboardingAction. Revalidating /app here would
  // re-render /app/welcome, whose "has a rubric → redirect to /app" guard would
  // unmount the wizard before its final "prepare a matter" step could show.
  return { ok: true };
}
