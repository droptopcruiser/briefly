"use client";

import { useActionState } from "react";
import type { WaitlistResult } from "@/app/waitlist-actions";

export function WaitlistForm({
  action,
}: {
  action: (prev: WaitlistResult, formData: FormData) => Promise<WaitlistResult>;
}) {
  const [state, formAction, pending] = useActionState<WaitlistResult, FormData>(action, {
    ok: false,
  });

  if (state.ok) {
    return (
      <p className="text-sm text-accent">
        You&apos;re on the list — we&apos;ll be in touch when a spot opens up.
      </p>
    );
  }

  return (
    <form action={formAction} className="mx-auto flex max-w-md flex-col gap-2 sm:flex-row">
      {/* Honeypot: hidden from humans, tempting to bots. */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden="true"
      />
      <input
        type="email"
        name="email"
        required
        placeholder="you@yourfirm.com"
        className="flex-1 rounded-md border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Joining…" : "Join the waitlist"}
      </button>
      {state.error ? (
        <span className="text-sm text-red-600 dark:text-red-400 sm:self-center">{state.error}</span>
      ) : null}
    </form>
  );
}
