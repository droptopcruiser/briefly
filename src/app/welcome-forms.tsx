"use client";

import { useActionState } from "react";
import type { OnboardResult } from "@/app/onboarding-actions";

type Action = (prev: OnboardResult, formData: FormData) => Promise<OnboardResult>;

/** Step 1 — invite code (gates account provisioning). */
export function InviteForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState<OnboardResult, FormData>(action, {
    ok: false,
  });

  return (
    <form action={formAction} className="space-y-3 max-w-sm">
      <label htmlFor="inviteCode" className="block text-sm font-medium">
        Invite code
      </label>
      <input
        id="inviteCode"
        name="inviteCode"
        autoFocus
        placeholder="Enter your invite code"
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
        >
          {pending ? "Checking…" : "Continue"}
        </button>
        {state.error ? (
          <span className="text-sm text-error">{state.error}</span>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        Briefly is invite-only during early access. Don&apos;t have a code?{" "}
        <a href="/#waitlist" className="underline underline-offset-2 hover:text-foreground">
          Join the waitlist
        </a>
        .
      </p>
    </form>
  );
}

/** Step 2 — firm name (finishes onboarding). */
export function OnboardingForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState<OnboardResult, FormData>(action, {
    ok: false,
  });

  return (
    <form action={formAction} className="space-y-3 max-w-sm">
      <label htmlFor="firmName" className="block text-sm font-medium">
        What&apos;s your firm called?
      </label>
      <input
        id="firmName"
        name="firmName"
        autoFocus
        maxLength={80}
        placeholder="e.g. Bennett Immigration Law"
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <p className="text-xs text-muted">
        Clients see this as the sender of your follow-ups (&ldquo;Briefly on behalf of your
        firm&rdquo;). You can change it later in Settings.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
        >
          {pending ? "Setting up…" : "Enter Briefly"}
        </button>
        {state.error ? (
          <span className="text-sm text-error">{state.error}</span>
        ) : null}
      </div>
    </form>
  );
}
