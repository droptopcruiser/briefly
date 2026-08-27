"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getCurrentAccount, DEFAULT_ACCOUNT_ID } from "@/lib/metering";
import { getMatter } from "@/lib/store";
import { addEvent } from "@/lib/events";
import {
  deriveSettlement,
  saveDateDecision,
  clearDateDecision,
  formatDate,
} from "@/lib/critical-dates";

/**
 * Confirm / edit / reject a matter's settlement date. These are the human gate on
 * the safety rule: only a CONFIRMED date is allowed to drive Critical urgency (see
 * src/lib/critical-dates.ts). The derived suggestion carries the source/provenance;
 * confirming (optionally with an edited date) stores the decision, rejecting
 * dismisses it, and clearing returns the matter to the raw suggestion.
 */

async function loadMatter(matterId: string) {
  const account = await getCurrentAccount();
  const accountId = account?.id ?? DEFAULT_ACCOUNT_ID;
  const matter = await getMatter(matterId, accountId);
  return { accountId, matter };
}

export async function confirmSettlement(
  matterId: string,
  edited?: { value: string; iso: string | null },
): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const { accountId, matter } = await loadMatter(matterId);
  if (!matter) return { ok: false };

  const derived = deriveSettlement(matter.result);
  const iso = edited ? edited.iso : derived?.iso ?? null;
  const value = iso ? formatDate(iso) : edited?.value?.trim() || derived?.value || "";
  if (!value) return { ok: false };

  await saveDateDecision(accountId, {
    matterId,
    kind: "settlement",
    status: "confirmed",
    value,
    iso,
    // Provenance always comes from what Briefly actually read — never invented,
    // even when the professional corrects the date itself.
    source: derived?.source ?? null,
    fromDocument: derived?.fromDocument ?? null,
    confirmedBy: user.id,
    confirmedAt: new Date().toISOString(),
  });
  await addEvent(accountId, matterId, "date_confirmed", `Settlement date confirmed: ${value}`);
  revalidatePath("/app");
  revalidatePath(`/matters/${matterId}`);
  return { ok: true };
}

export async function rejectSettlement(matterId: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const { accountId, matter } = await loadMatter(matterId);
  if (!matter) return { ok: false };

  const derived = deriveSettlement(matter.result);
  await saveDateDecision(accountId, {
    matterId,
    kind: "settlement",
    status: "rejected",
    value: derived?.value ?? "",
    iso: derived?.iso ?? null,
    source: derived?.source ?? null,
    fromDocument: derived?.fromDocument ?? null,
    confirmedBy: user.id,
    confirmedAt: new Date().toISOString(),
  });
  await addEvent(accountId, matterId, "date_rejected", "Settlement date dismissed — not a settlement date");
  revalidatePath("/app");
  revalidatePath(`/matters/${matterId}`);
  return { ok: true };
}

/** Undo a confirm/reject — the matter falls back to Briefly's raw suggestion. */
export async function clearSettlement(matterId: string): Promise<{ ok: boolean }> {
  await requireUser();
  const { accountId } = await loadMatter(matterId);
  await clearDateDecision(accountId, matterId);
  await addEvent(accountId, matterId, "date_cleared", "Settlement date decision cleared");
  revalidatePath("/app");
  revalidatePath(`/matters/${matterId}`);
  return { ok: true };
}
