"use client";

import { useActionState, useState } from "react";
import type { SettingsResult } from "@/app/actions";

/**
 * Firm-name setting. Drives the outbound sender line: emails go out as
 * "Briefly on behalf of {Firm}" from the shared verified address. A live preview
 * shows the exact From line the client will see.
 */
export function SettingsForm({
  initialName,
  address,
  action,
}: {
  initialName: string;
  address: string;
  action: (prev: SettingsResult, formData: FormData) => Promise<SettingsResult>;
}) {
  const [name, setName] = useState(initialName);
  const [state, formAction, pending] = useActionState<SettingsResult, FormData>(action, {
    ok: false,
  });

  const trimmed = name.trim();
  const preview = trimmed
    ? `"Briefly on behalf of ${trimmed}" <${address}>`
    : `Briefly <${address}>`;

  return (
    <form action={formAction} className="space-y-4 max-w-xl">
      <div className="space-y-1.5">
        <label htmlFor="firmName" className="text-sm font-medium">
          Firm name
        </label>
        <input
          id="firmName"
          name="firmName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="e.g. Bennett Immigration Law"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <p className="text-xs text-muted">
          Shown to clients as the sender of your follow-up emails.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface px-4 py-3">
        <div className="text-xs uppercase tracking-wide text-muted">Emails will send from</div>
        <div className="mt-1 text-sm font-medium break-words">{preview}</div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state.ok ? (
          <span className="text-sm text-accent">Saved ✓</span>
        ) : state.error ? (
          <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span>
        ) : null}
      </div>
    </form>
  );
}
