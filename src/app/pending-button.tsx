"use client";

import { useFormStatus } from "react-dom";

/**
 * A submit button that reflects the enclosing form's pending state — so a server
 * action that takes a beat (e.g. preparing a brief is a ~10-20s model call) shows
 * a spinner and a "working" label instead of looking dead. Must be rendered
 * inside a <form action={…}>.
 */

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function SubmitButton({
  idleLabel,
  pendingLabel,
  variant = "primary",
  className = "",
}: {
  idleLabel: string;
  pendingLabel: string;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const { pending } = useFormStatus();
  const base =
    variant === "primary"
      ? "bg-accent text-accent-fg"
      : "border border-border hover:bg-inset";
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-70 ${base} ${className}`}
    >
      {pending ? (
        <>
          <Spinner />
          {pendingLabel}
        </>
      ) : (
        idleLabel
      )}
    </button>
  );
}
