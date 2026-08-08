import type { User } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

/**
 * Team membership, invites, and matter assignment (Teams v1). All reads/writes
 * are scoped by account_id — the caller resolves the account (and checks manager
 * role for management actions) before calling these.
 */

export interface Member {
  userId: string;
  email: string | null;
  name: string | null;
  role: string;
}

export interface Invite {
  id: string;
  email: string;
  role: string;
}

export async function listMembers(accountId: string): Promise<Member[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data, error } = await db
    .from("account_members")
    .select("user_id,email,name,role")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listMembers: ${error.message}`);
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    email: r.email,
    name: r.name,
    role: r.role,
  }));
}

export async function listInvites(accountId: string): Promise<Invite[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data, error } = await db
    .from("account_invites")
    .select("id,email,role")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listInvites: ${error.message}`);
  return (data ?? []).map((r) => ({ id: r.id, email: r.email, role: r.role }));
}

/** Invite a teammate by email. Role is 'member' or 'admin' (never 'owner'). */
export async function inviteMember(
  accountId: string,
  email: string,
  role: "member" | "admin",
  invitedBy: string,
): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  const lower = email.toLowerCase();

  // Already on the team?
  const { data: member } = await db
    .from("account_members")
    .select("user_id")
    .eq("account_id", accountId)
    .eq("email", lower)
    .maybeSingle();
  if (member) throw new Error("That person is already a member of your firm.");

  // Upsert the invite (the unique index is on lower(email), an expression index,
  // so we can't use ON CONFLICT — check for an existing invite, then update/insert).
  const { data: existing } = await db
    .from("account_invites")
    .select("id")
    .eq("account_id", accountId)
    .eq("email", lower)
    .maybeSingle();

  const { error } = existing
    ? await db.from("account_invites").update({ role, invited_by: invitedBy }).eq("id", existing.id)
    : await db
        .from("account_invites")
        .insert({ account_id: accountId, email: lower, role, invited_by: invitedBy });
  if (error) throw new Error(`inviteMember: ${error.message}`);
}

export async function revokeInvite(accountId: string, inviteId: string): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  const { error } = await db
    .from("account_invites")
    .delete()
    .eq("account_id", accountId)
    .eq("id", inviteId);
  if (error) throw new Error(`revokeInvite: ${error.message}`);
}

/** Remove a member (never the owner). */
export async function removeMember(accountId: string, userId: string): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  const { error } = await db
    .from("account_members")
    .delete()
    .eq("account_id", accountId)
    .eq("user_id", userId)
    .neq("role", "owner");
  if (error) throw new Error(`removeMember: ${error.message}`);
}

/**
 * If the signed-in user has a pending invite (by email) and no membership yet,
 * join that account. Returns true when a join happened. One account per user in
 * v1: users who already belong to an account can't accept another invite.
 */
export async function acceptPendingInvite(user: User): Promise<boolean> {
  const db = getSupabase();
  if (!db) return false;
  const email = user.email?.toLowerCase();
  if (!email) return false;

  const { data: existing } = await db
    .from("account_members")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) return false;

  const { data: invites } = await db
    .from("account_invites")
    .select("id,account_id,role")
    .eq("email", email)
    .limit(1);
  const invite = invites?.[0];
  if (!invite) return false;

  const name =
    (user.user_metadata?.name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    null;

  const { error } = await db.from("account_members").insert({
    account_id: invite.account_id,
    user_id: user.id,
    email,
    name,
    role: invite.role,
  });
  if (error) throw new Error(`acceptPendingInvite: ${error.message}`);

  await db.from("account_invites").delete().eq("id", invite.id);
  return true;
}

/**
 * Assign (or unassign) a matter to a teammate. The assignee must be a member of
 * the same account; passing null clears the assignment.
 */
export async function setAssignee(
  accountId: string,
  matterId: string,
  userId: string | null,
): Promise<void> {
  const db = getSupabase();
  if (!db) return;

  if (userId) {
    const { data: member } = await db
      .from("account_members")
      .select("user_id")
      .eq("account_id", accountId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) throw new Error("Assignee is not a member of this firm.");
  }

  const { error } = await db
    .from("matters")
    .update({ assigned_to: userId })
    .eq("id", matterId)
    .eq("account_id", accountId);
  if (error) throw new Error(`setAssignee: ${error.message}`);
}
