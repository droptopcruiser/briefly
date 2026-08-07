"use client";

import { useActionState, useState } from "react";
import type { SendResult } from "@/app/actions";

/**
 * The "act" step. "Approve & send" is the human gate: on click, Briefly sends
 * the drafted follow-up to the client (server-side, via Postmark) and marks the
 * matter approved. "Copy draft" and the mail-client link are always-available
 * fallbacks — for long emails, or when no client email was detected.
 */
export function DraftActions({
  id,
  to,
  subject,
  body,
  approved,
  action,
}: {
  id: string;
  to: string | null;
  subject: string;
  body: string;
  approved: boolean;
  action: (prev: SendResult, formData: FormData) => Promise<SendResult>;
}) {
  const [state, formAction, pending] = useActionState<SendResult, FormData>(action, {
    ok: approved,
  });
  const [copied, setCopied] = useState(false);

  const mailto = `mailto:${encodeURIComponent(to ?? "")}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (no permission / insecure context) — no-op.
    }
  }

  const copyBtn = (
    <button
      type="button"
      onClick={copyDraft}
      className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-background"
    >
      {copied ? "Copied ✓" : "Copy draft"}
    </button>
  );

  // Already approved & sent.
  if (approved) {
    return (
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <span className="rounded-md border border-accent px-4 py-2 text-sm font-medium text-accent">
          ✓ Approved &amp; sent
        </span>
        <a
          href={mailto}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-background"
        >
          Reopen in mail client
        </a>
        {copyBtn}
      </div>
    );
  }

  // No client email detected — Briefly can't auto-send; offer manual paths.
  if (!to) {
    return (
      <div className="space-y-2 pt-1">
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={mailto}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90"
          >
            Send in mail client
          </a>
          {copyBtn}
        </div>
        <p className="text-xs text-muted">
          No client email was detected in this enquiry, so Briefly can&apos;t send it for you. Add
          the address in your mail client and send there.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-1">
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
        >
          {pending ? "Sending…" : "Approve & send"}
        </button>
        {copyBtn}
        <a
          href={mailto}
          className="text-xs text-muted underline underline-offset-2 hover:text-foreground"
        >
          or send from your own mail client
        </a>
      </form>
      {state.error ? (
        <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>
      ) : (
        <p className="text-xs text-muted">
          Sends the follow-up to {to} from your firm&apos;s address. Briefly never sends without
          your approval.
        </p>
      )}
    </div>
  );
}
