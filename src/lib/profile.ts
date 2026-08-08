import { cache } from "react";
import { getAuthUser } from "./auth";
import { getSupabase } from "./supabase";

/**
 * Per-user profile: display name + avatar. Backed by the user's account_members
 * row (name is the display name, avatar_url the uploaded picture), falling back
 * to the Google identity (name + picture) from auth metadata when unset.
 */

export interface Profile {
  userId: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const user = await getAuthUser();
  if (!user) return null;

  const meta = user.user_metadata ?? {};
  let name = (meta.name as string) || (meta.full_name as string) || null;
  let avatarUrl = (meta.avatar_url as string) || (meta.picture as string) || null;

  const db = getSupabase();
  if (db) {
    const { data } = await db
      .from("account_members")
      .select("name,avatar_url")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      if (data.name) name = data.name;
      if (data.avatar_url) avatarUrl = data.avatar_url;
    }
  }

  return { userId: user.id, email: user.email ?? null, name, avatarUrl };
});

export async function saveProfileName(userId: string, name: string): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  const { error } = await db
    .from("account_members")
    .update({ name: name.trim() })
    .eq("user_id", userId);
  if (error) throw new Error(`saveProfileName: ${error.message}`);
}

export async function setProfileAvatar(userId: string, url: string): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  const { error } = await db
    .from("account_members")
    .update({ avatar_url: url })
    .eq("user_id", userId);
  if (error) throw new Error(`setProfileAvatar: ${error.message}`);
}
