"use client";

import { useActionState } from "react";
import type { TeamResult } from "@/app/team-actions";

export function TeamInviteForm({
  action,
}: {
  action: (prev: TeamResult, formData: FormData) => Promise<TeamResult>;
}) {
  const [state, formAction, pending] = useActionState<TeamResult, FormData>(action, {
    ok: false,
  });

  return (
    <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input
        type="email"
        name="email"
        required
        placeholder="teammate@yourfirm.com"
        className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <select
        name="role"
        defaultValue="member"
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
      >
        <option value="member">Member</option>
        <option value="admin">Admin</option>
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
      >
        {pending ? "Inviting…" : "Invite"}
      </button>
      {state.ok ? (
        <span
          className={`text-sm sm:self-center ${
            state.note ? "text-amber-700 dark:text-amber-400" : "text-accent"
          }`}
        >
          {state.note ?? "Invited ✓ — we've emailed them."}
        </span>
      ) : state.error ? (
        <span className="text-sm text-red-600 dark:text-red-400 sm:self-center">{state.error}</span>
      ) : null}
    </form>
  );
}
