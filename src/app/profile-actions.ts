"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { saveProfileName, setProfileAvatar } from "@/lib/profile";

export type ProfileResult = { ok: boolean; error?: string };

/** Update the signed-in user's display name (their account_members.name). */
export async function updateProfileName(
  _prev: ProfileResult,
  formData: FormData,
): Promise<ProfileResult> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").replace(/[\r\n]/g, "").trim();
  if (!name) return { ok: false, error: "Enter your name." };
  if (name.length > 80) return { ok: false, error: "Keep it under 80 characters." };

  try {
    await saveProfileName(user.id, name);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save." };
  }
  revalidatePath("/app/profile");
  revalidatePath("/", "layout"); // refresh the header avatar/name
  return { ok: true };
}

/** Upload a new profile picture to the 'avatars' bucket and save its URL. */
export async function uploadAvatar(
  _prev: ProfileResult,
  formData: FormData,
): Promise<ProfileResult> {
  const user = await requireUser();
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose an image." };
  if (!file.type.startsWith("image/")) return { ok: false, error: "That file isn't an image." };
  if (file.size > 2_000_000) return { ok: false, error: "Keep it under 2 MB." };

  const db = getSupabase();
  if (!db) return { ok: false, error: "Storage isn't configured on this environment." };

  const path = user.id; // one avatar per user, overwritten on change
  const { error: upErr } = await db.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) return { ok: false, error: upErr.message };

  const { data } = db.storage.from("avatars").getPublicUrl(path);
  try {
    // Cache-bust so the new image shows immediately.
    await setProfileAvatar(user.id, `${data.publicUrl}?t=${Date.now()}`);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not update profile." };
  }
  revalidatePath("/app/profile");
  revalidatePath("/", "layout");
  return { ok: true };
}
