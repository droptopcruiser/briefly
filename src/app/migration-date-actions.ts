"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getMatter, setMigrationDateResolutions } from "@/lib/store";
import { getCurrentAccount, DEFAULT_ACCOUNT_ID } from "@/lib/metering";

/** Resolve a migration date conflict: the human picks the true value. The others stay
 *  cited for audit; the conflict clears. Nothing is auto-decided — this is a click. */
export async function resolveMigrationDate(
  matterId: string,
  slotKey: string,
  value: string,
): Promise<{ ok: boolean }> {
  await requireUser();
  const account = await getCurrentAccount();
  const accountId = account?.id ?? DEFAULT_ACCOUNT_ID;
  const matter = await getMatter(matterId, accountId);
  if (!matter) return { ok: false };
  const map = { ...(matter.migrationDateResolutions ?? {}), [slotKey]: value };
  await setMigrationDateResolutions(accountId, matterId, map);
  revalidatePath(`/matters/${matterId}`);
  return { ok: true };
}

/** Reopen a resolved date conflict (undo the pick). */
export async function reopenMigrationDate(matterId: string, slotKey: string): Promise<{ ok: boolean }> {
  await requireUser();
  const account = await getCurrentAccount();
  const accountId = account?.id ?? DEFAULT_ACCOUNT_ID;
  const matter = await getMatter(matterId, accountId);
  if (!matter) return { ok: false };
  const map = { ...(matter.migrationDateResolutions ?? {}) };
  delete map[slotKey];
  await setMigrationDateResolutions(accountId, matterId, map);
  revalidatePath(`/matters/${matterId}`);
  return { ok: true };
}
