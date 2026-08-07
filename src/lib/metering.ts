import { getSupabase } from "./supabase";
import { planFor } from "./plans";
import { getAuthUser } from "./auth";

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
}

interface AccountRow {
  id: string;
  name: string;
  plan: string;
  credits: number;
  slug: string | null;
  inbound_token: string | null;
  owner_user_id: string | null;
}

const ACCOUNT_COLS = "id,name,plan,credits,slug,inbound_token,owner_user_id";

function rowToAccount(r: AccountRow): Account {
  return {
    id: r.id,
    name: r.name,
    plan: r.plan,
    credits: r.credits,
    slug: r.slug,
    inboundToken: r.inbound_token,
    ownerUserId: r.owner_user_id,
  };
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

function monthStartISO(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** Look up an account by id. Null when not found or metering is disabled. */
export async function getAccountById(id: string): Promise<Account | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db.from("accounts").select(ACCOUNT_COLS).eq("id", id).maybeSingle();
  return data ? rowToAccount(data as AccountRow) : null;
}

/**
 * The signed-in user's account (one owner-user per account for now). Null when
 * the user has none yet (provisioning happens in onboarding) or no Supabase.
 * This is the primary resolver for all user-context reads/writes.
 */
export async function getCurrentAccount(): Promise<Account | null> {
  const db = getSupabase();
  if (!db) return null;
  const user = await getAuthUser();
  if (!user) return null;
  const { data } = await db
    .from("accounts")
    .select(ACCOUNT_COLS)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  return data ? rowToAccount(data as AccountRow) : null;
}

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

export async function getUsage(account: Account): Promise<Usage> {
  const db = getSupabase()!;
  const { count } = await db
    .from("matters")
    .select("id", { count: "exact", head: true })
    .eq("account_id", account.id)
    .gte("created_at", monthStartISO());

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
