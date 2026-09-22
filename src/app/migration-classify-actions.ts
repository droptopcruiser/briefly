"use server";

import { requireUser } from "@/lib/auth";
import { getMatter, saveMatter } from "@/lib/store";
import { getCurrentAccount, DEFAULT_ACCOUNT_ID } from "@/lib/metering";
import { augmentWithMigration } from "@/lib/pipeline";
import type { MigrationStream } from "@/lib/types";

/** P5c — classifier actions. Keep accepts the routing; Move re-runs extract + placement
 *  on the chosen book (its stream's party types only); Unrouted clears the book, gaps wait. */

async function load(matterId: string) {
  const account = await getCurrentAccount();
  return getMatter(matterId, account?.id ?? DEFAULT_ACCOUNT_ID);
}

export async function moveMigrationBook(matterId: string, stream: MigrationStream): Promise<{ ok: boolean }> {
  await requireUser();
  const matter = await load(matterId);
  if (!matter?.result) return { ok: false };
  matter.result = augmentWithMigration(matter.submission ?? "", matter.result, stream);
  matter.updatedAt = new Date().toISOString();
  await saveMatter(matter);
  return { ok: true };
}

export async function setUnroutedMigration(matterId: string): Promise<{ ok: boolean }> {
  await requireUser();
  const matter = await load(matterId);
  if (!matter?.result) return { ok: false };
  matter.result = { ...matter.result, migration: null, migrationRouting: { status: "unrouted", reason: "set unrouted by you" } };
  matter.updatedAt = new Date().toISOString();
  await saveMatter(matter);
  return { ok: true };
}

export async function keepMigrationRouting(matterId: string): Promise<{ ok: boolean }> {
  await requireUser();
  const matter = await load(matterId);
  const routing = matter?.result?.migrationRouting;
  if (!matter?.result || !routing) return { ok: false };
  matter.result = { ...matter.result, migrationRouting: { ...routing, confirmed: true } };
  await saveMatter(matter);
  return { ok: true };
}
