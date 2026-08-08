"use client";

import { useState, useTransition } from "react";

/** Assign / hand off a matter to a teammate. Saves immediately on change. */
export function AssignControl({
  matterId,
  members,
  current,
  action,
}: {
  matterId: string;
  members: { userId: string; label: string }[];
  current: string | null;
  action: (matterId: string, userId: string | null) => Promise<void>;
}) {
  const [value, setValue] = useState(current ?? "");
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted">Assigned to</span>
      <select
        value={value}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          startTransition(() => action(matterId, v || null));
        }}
        className="rounded-md border border-border bg-surface px-2.5 py-1 text-sm outline-none focus:border-accent disabled:opacity-60"
      >
        <option value="">Unassigned</option>
        {members.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
  );
}
