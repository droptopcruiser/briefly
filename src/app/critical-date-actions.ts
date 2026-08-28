"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getCurrentAccount, DEFAULT_ACCOUNT_ID } from "@/lib/metering";
import { getMatter } from "@/lib/store";
import { addEvent } from "@/lib/events";
import { deriveDate, candidateIsos } from "@/lib/critical-date-derive";
import { saveDateDecision, clearDateDecision } from "@/lib/critical-dates";
import { formatDate, kindNoun, type CriticalDateKind } from "@/lib/critical-date-types";

/**
 * Confirm / edit / reject a matter's critical date (settlement, finance, …). The
 * human gate on the safety rule: only a CONFIRMED date is allowed to drive Critical
 * urgency (see src/lib/critical-dates.ts). The derived suggestion carries the
 * source/provenance; confirming (optionally with an edited date) stores the
 * decision, rejecting dismisses it, clearing returns to the raw suggestion.
 */

async function loadMatter(matterId: string) {
  const account = await getCurrentAccount();
  const accountId = account?.id ?? DEFAULT_ACCOUNT_ID;
  const matter = await getMatter(matterId, accountId);
  return { accountId, matter };
}

export async function confirmDate(
  matterId: string,
  kind: CriticalDateKind,
  edited?: {
    value: string;
    iso: string | null;
    source?: string | null;
    fromDocument?: { fileName: string; page: number | null } | null;
  },
): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const { accountId, matter } = await loadMatter(matterId);
  if (!matter) return { ok: false };

  const derived = deriveDate(matter.result, kind);
  const iso = edited ? edited.iso : derived?.iso ?? null;
  const value = iso ? formatDate(iso) : edited?.value?.trim() || derived?.value || "";
  if (!value) return { ok: false };

  // Provenance is the CHOSEN source (the resolved candidate's quote/page), or the
  // single derived suggestion's — never invented. A manually typed date has none.
  const source = edited ? edited.source ?? null : derived?.source ?? null;
  const fromDocument = edited ? edited.fromDocument ?? null : derived?.fromDocument ?? null;

  await saveDateDecision(accountId, {
    matterId,
    kind,
    status: "confirmed",
    value,
    iso,
    source,
    fromDocument,
    confirmedBy: user.id,
    confirmedAt: new Date().toISOString(),
    knownIsos: candidateIsos(matter.result, kind),
  });
  await addEvent(accountId, matterId, "date_confirmed", `${kindNoun(kind)} date confirmed: ${value}`);
  revalidatePath("/app");
  revalidatePath(`/matters/${matterId}`);
  return { ok: true };
}

export async function rejectDate(matterId: string, kind: CriticalDateKind): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const { accountId, matter } = await loadMatter(matterId);
  if (!matter) return { ok: false };

  const derived = deriveDate(matter.result, kind);
  await saveDateDecision(accountId, {
    matterId,
    kind,
    status: "rejected",
    value: derived?.value ?? "",
    iso: derived?.iso ?? null,
    source: derived?.source ?? null,
    fromDocument: derived?.fromDocument ?? null,
    confirmedBy: user.id,
    confirmedAt: new Date().toISOString(),
    knownIsos: candidateIsos(matter.result, kind),
  });
  await addEvent(accountId, matterId, "date_rejected", `${kindNoun(kind)} date dismissed`);
  revalidatePath("/app");
  revalidatePath(`/matters/${matterId}`);
  return { ok: true };
}

/** Undo a confirm/reject — the matter falls back to Briefly's raw suggestion. */
export async function clearDate(matterId: string, kind: CriticalDateKind): Promise<{ ok: boolean }> {
  await requireUser();
  const { accountId } = await loadMatter(matterId);
  await clearDateDecision(accountId, matterId, kind);
  await addEvent(accountId, matterId, "date_cleared", `${kindNoun(kind)} date decision cleared`);
  revalidatePath("/app");
  revalidatePath(`/matters/${matterId}`);
  return { ok: true };
}
