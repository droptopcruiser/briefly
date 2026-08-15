import { cache } from "react";
import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { getSupabase } from "./supabase";
import { planFor } from "./plans";
import { getAuthUser, requireUser } from "./auth";
import { monthStartISO } from "./month";

/**
 * Metering: usage counting + hard caps, provider-agnostic. Usage is the number
 * of extractions (matters) an account creates in the current calendar month.
 * When the plan cap is exhausted, purchased credits cover overage; when both are
 * gone, ingestion is blocked before any model tokens are spent.
 *
 * Single account for now (multi-tenant later); everything routes to the default
 * account. When Supabase isn't configured (local/in-memory dev), metering is
 * disabled and ingestion is unlimited.
 */

export const DEFAULT_ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";

/** The inbound intake domain (catch-all MX → Postmark). Prod default. */
export const INBOUND_DOMAIN = process.env.MAIL_INBOUND_DOMAIN ?? "inbound.brieflyhub.app";

/** The full inbound intake email address for an account (null until onboarded). */
export function intakeAddress(inboundToken: string | null): string | null {
  return inboundToken ? `${inboundToken}@${INBOUND_DOMAIN}` : null;
}

/** Where client replies to a follow-up should land. */
export type ReplyToMode = "firm" | "intake";

export interface Account {
  id: string;
  name: string;
  plan: string;
  credits: number;
  /** Readable identifier (from firm name). Null until onboarding. */
  slug: string | null;
  /** Full localpart of this firm's inbound intake address (slug + token). */
  inboundToken: string | null;
  /** The single owner user (teams come later). Null on the legacy default. */
  ownerUserId: string | null;
  /** Signature/footer appended to every sent follow-up. Null = a default signoff. */
  emailSignature: string | null;
  /** 'firm' -> replyToEmail; 'intake' -> loop into the intake address; null = none. */
  replyToMode: ReplyToMode | null;
  /** The firm's own reply address (used when replyToMode === 'firm'). */
  replyToEmail: string | null;
  /** IANA timezone for "this month" boundaries (usage + stats). Null = UTC. */
  timezone: string | null;
}

interface AccountRow {
  id: string;
  name: string;
  plan: string;
  credits: number;
  slug: string | null;
  inbound_token: string | null;
  owner_user_id: string | null;
  email_signature: string | null;
  reply_to_mode: string | null;
  reply_to_email: string | null;
  timezone: string | null;
}

const ACCOUNT_COLS =
  "id,name,plan,credits,slug,inbound_token,owner_user_id,email_signature,reply_to_mode,reply_to_email,timezone";

function rowToAccount(r: AccountRow): Account {
  return {
    id: r.id,
    name: r.name,
    plan: r.plan,
    credits: r.credits,
    slug: r.slug,
    inboundToken: r.inbound_token,
    ownerUserId: r.owner_user_id,
    emailSignature: r.email_signature,
    replyToMode: r.reply_to_mode === "firm" || r.reply_to_mode === "intake" ? r.reply_to_mode : null,
    replyToEmail: r.reply_to_email,
    timezone: r.timezone,
  };
}

/** Resolve the Reply-To address for an account's outbound mail (null = none). */
export function resolveReplyTo(account: Account): string | null {
  if (account.replyToMode === "intake") return intakeAddress(account.inboundToken);
  if (account.replyToMode === "firm") return account.replyToEmail?.trim() || null;
  return null;
}

// ── Onboarding + provisioning (multi-tenant signup) ──────────────────────────

const FIRM_PLACEHOLDER = "Default firm";

/** A firm is onboarded once it has set a real firm name (past the placeholder). */
export function isOnboarded(account: Account | null): account is Account {
  const name = account?.name.trim();
  return Boolean(name && name !== FIRM_PLACEHOLDER);
}

/**
 * App gate: require a signed-in user AND a provisioned, onboarded account.
 * Bounces to /app/welcome (invite code → firm name) otherwise. Returns the
 * account so pages don't have to re-resolve it.
 */
export async function requireAccount(): Promise<Account> {
  await requireUser();
  const account = await getCurrentAccount();
  if (!isOnboarded(account)) redirect("/app/welcome");
  return account;
}

/**
 * Gate for manager-only surfaces (team, settings, rubrics). Requires an onboarded
 * account AND an owner/admin role; sends members back to the dashboard. Returns
 * the account and the caller's membership.
 */
export async function requireManager(): Promise<{ account: Account; membership: Membership }> {
  const account = await requireAccount();
  const membership = await getCurrentMembership();
  if (!membership || !isManager(membership.role)) redirect("/app");
  return { account, membership };
}

function slugify(s: string): string {
  return (
    s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "firm"
  );
}

/** A globally-unique inbound intake localpart, "{slug}-{random}". */
export async function generateInboundToken(slug: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const token = `${slug}-${randomBytes(3).toString("hex")}`;
    if (!(await getAccountByInboundToken(token))) return token;
  }
  return `${slug}-${randomBytes(6).toString("hex")}`;
}

/**
 * Create a trial account owned by the user + their owner membership (idempotent).
 * Firm name is set later in onboarding.
 */
export async function provisionAccount(
  userId: string,
  email: string | null,
  name: string | null,
): Promise<Account> {
  const db = getSupabase();
  if (!db) throw new Error("Database not configured.");

  const { data: existing } = await db
    .from("accounts")
    .select(ACCOUNT_COLS)
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (existing) return rowToAccount(existing as AccountRow);

  const { data, error } = await db
    .from("accounts")
    .insert({ owner_user_id: userId, name: "", plan: "trial", credits: 0 })
    .select(ACCOUNT_COLS)
    .single();
  if (error) throw new Error(`provisionAccount: ${error.message}`);
  const account = rowToAccount(data as AccountRow);

  const { error: memberErr } = await db.from("account_members").insert({
    account_id: account.id,
    user_id: userId,
    email: email?.toLowerCase() ?? null,
    name: name ?? null,
    role: "owner",
  });
  if (memberErr) throw new Error(`provisionAccount(member): ${memberErr.message}`);

  return account;
}

/** Finish onboarding: set the firm name, a slug, and the inbound intake token. */
export async function completeOnboarding(account: Account, name: string): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  const slug = slugify(name);
  const inbound_token = account.inboundToken ?? (await generateInboundToken(slug));
  const { error } = await db
    .from("accounts")
    .update({ name: name.trim(), slug, inbound_token })
    .eq("id", account.id);
  if (error) throw new Error(`completeOnboarding: ${error.message}`);
}

export interface Usage {
  used: number;
  cap: number;
  credits: number;
  remaining: number;
  blocked: boolean;
  planName: string;
  priceLabel: string;
}

export class QuotaExceededError extends Error {
  constructor() {
    super("quota_exceeded");
    this.name = "QuotaExceededError";
  }
}

/** Look up an account by id. Null when not found or metering is disabled. */
export async function getAccountById(id: string): Promise<Account | null> {
  const db = getSupabase();
  if (!db) return null;
  const t = Date.now();
  const { data } = await db.from("accounts").select(ACCOUNT_COLS).eq("id", id).maybeSingle();
  console.log(`[auth-timing] accounts query ms=${Date.now() - t}`);
  return data ? rowToAccount(data as AccountRow) : null;
}

export interface Membership {
  accountId: string;
  userId: string;
  role: string;
}

/** Owner and admin are "managers" — they manage team, settings, and rubrics. */
export function isManager(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** The signed-in user's membership (which firm + their role), or null. Cached. */
export const getCurrentMembership = cache(async (): Promise<Membership | null> => {
  const db = getSupabase();
  if (!db) return null;
  const user = await getAuthUser();
  if (!user) return null;
  const t = Date.now();
  const { data } = await db
    .from("account_members")
    .select("account_id,user_id,role")
    .eq("user_id", user.id)
    .maybeSingle();
  console.log(`[auth-timing] account_members query ms=${Date.now() - t}`);
  return data
    ? { accountId: data.account_id, userId: data.user_id, role: data.role }
    : null;
});

/**
 * The signed-in user's account, resolved via team membership. Null when the user
 * belongs to no account yet (onboarding) or no Supabase. Primary resolver for
 * all user-context reads/writes. Cached per request.
 */
export const getCurrentAccount = cache(async (): Promise<Account | null> => {
  const membership = await getCurrentMembership();
  if (!membership) return null;
  return getAccountById(membership.accountId);
});

/** Resolve an account by its inbound intake localpart (for the email webhook). */
export async function getAccountByInboundToken(token: string): Promise<Account | null> {
  const db = getSupabase();
  if (!db || !token) return null;
  const { data } = await db
    .from("accounts")
    .select(ACCOUNT_COLS)
    .eq("inbound_token", token)
    .maybeSingle();
  return data ? rowToAccount(data as AccountRow) : null;
}

/** Update the firm/display name for an account (drives the outbound sender line). */
export async function setFirmName(accountId: string, name: string): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  const { error } = await db
    .from("accounts")
    .update({ name: name.trim() })
    .eq("id", accountId);
  if (error) throw new Error(`setFirmName: ${error.message}`);
}

export interface AccountSettingsInput {
  name: string;
  emailSignature: string | null;
  replyToMode: ReplyToMode | null;
  replyToEmail: string | null;
  timezone: string | null;
}

/** Save the firm's settings (name, signature, reply-to, timezone) in one write. */
export async function updateAccountSettings(
  accountId: string,
  s: AccountSettingsInput,
): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  const { error } = await db
    .from("accounts")
    .update({
      name: s.name.trim(),
      email_signature: s.emailSignature?.trim() || null,
      reply_to_mode: s.replyToMode,
      reply_to_email: s.replyToEmail?.trim() || null,
      timezone: s.timezone?.trim() || null,
    })
    .eq("id", accountId);
  if (error) throw new Error(`updateAccountSettings: ${error.message}`);
}

export async function getUsage(account: Account): Promise<Usage> {
  const db = getSupabase()!;
  const { count } = await db
    .from("matters")
    .select("id", { count: "exact", head: true })
    .eq("account_id", account.id)
    .gte("created_at", monthStartISO(account.timezone));

  const used = count ?? 0;
  const plan = planFor(account.plan);
  const cap = plan.monthlyMatters;
  const remaining = Math.max(0, cap - used) + account.credits;

  return {
    used,
    cap,
    credits: account.credits,
    remaining,
    blocked: remaining <= 0,
    planName: plan.name,
    priceLabel: plan.priceLabel,
  };
}

/** Current account + usage, or null when metering is disabled. For the UI. */
export async function getAccountUsage(): Promise<{ account: Account; usage: Usage } | null> {
  const account = await getCurrentAccount();
  if (!account) return null;
  return { account, usage: await getUsage(account) };
}

/**
 * Consume one credit if this extraction was over the plan cap. `usedBefore` is
 * the month's usage measured just before the new matter was created, so
 * `usedBefore >= cap` means the new matter is overage.
 */
export async function consumeCreditIfOverCap(account: Account, usedBefore: number): Promise<void> {
  const cap = planFor(account.plan).monthlyMatters;
  if (usedBefore >= cap && account.credits > 0) {
    const db = getSupabase()!;
    await db.from("accounts").update({ credits: account.credits - 1 }).eq("id", account.id);
  }
}
