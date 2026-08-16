"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/metering";
import {
  saveRubric as storeSaveRubric,
  deleteRubric as storeDeleteRubric,
} from "@/lib/rubric-store";
import { SEED_RUBRICS } from "@/lib/rubrics";
import type { Rubric } from "@/lib/types";

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "field"
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

/**
 * Create or update a rubric. Keys are generated from labels (existing keys are
 * preserved so historical matters still map), then deduped. Managers only.
 */
export async function saveRubric(input: Rubric): Promise<void> {
  const { account } = await requireManager();
  const accountId = account.id;

  const fieldKey = keyer();
  const fields = input.fields
    .filter((f) => f.label.trim())
    .map((f) => ({
      key: fieldKey(f.key?.trim() || slug(f.label)),
      label: f.label.trim(),
      description: f.description.trim(),
      required: Boolean(f.required),
      type: f.type,
      options:
        f.type === "enum"
          ? (f.options ?? []).map((o) => o.trim()).filter(Boolean)
          : undefined,
    }));

  const docKey = keyer();
  const documents = input.documents
    .filter((d) => d.label.trim())
    .map((d) => ({
      key: docKey(d.key?.trim() || slug(d.label)),
      label: d.label.trim(),
      description: d.description.trim(),
      required: Boolean(d.required),
    }));

  const rubric: Rubric = {
    id: input.id?.trim() || randomUUID(),
    name: input.name.trim() || "Untitled matter type",
    vertical: input.vertical.trim() || "General",
    description: input.description.trim(),
    fields,
    documents,
    prepareBriefWhenReady: input.prepareBriefWhenReady !== false,
    nextActionIntent: input.nextActionIntent?.trim() || undefined,
  };

  await storeSaveRubric(accountId, rubric);
  revalidatePath("/app/rubrics");
  redirect("/app/rubrics");
}

export async function deleteRubric(formData: FormData): Promise<void> {
  const { account } = await requireManager();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await storeDeleteRubric(account.id, id);
  revalidatePath("/app/rubrics");
}

/** Copy a built-in rubric into the account as an editable starting point. */
export async function duplicateSeed(formData: FormData): Promise<void> {
  const { account } = await requireManager();
  const seedId = String(formData.get("seedId") ?? "");
  const seed = SEED_RUBRICS.find((r) => r.id === seedId);
  if (!seed) return;
  const copy: Rubric = { ...seed, id: randomUUID() };
  await storeSaveRubric(account.id, copy);
  revalidatePath("/app/rubrics");
  redirect(`/app/rubrics/${copy.id}`);
}
