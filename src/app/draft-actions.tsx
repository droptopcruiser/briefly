"use client";

import { useState, useTransition } from "react";

/**
 * Phase 1.5 — the "Act" step, low-infra variant.
 *
 * The AI never sends. "Approve & send" opens the professional's own mail client
 * with the draft prefilled (mailto) and records approval; the human reviews and
 * hits send there. "Copy draft" is the fallback for long emails or clients that
 * don't honour mailto. The full transactional-send path (Resend) comes later.
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
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

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

  function approveAndSend() {
    // Open the professional's mail client. They review and send it themselves.
    window.location.href = mailto;
    const fd = new FormData();
    fd.set("id", id);
    startTransition(() => action(fd));
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

  return (
    <div className="flex flex-wrap items-center gap-3 pt-1">
      <button
        type="button"
        onClick={approveAndSend}
        disabled={pending}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
      >
        {pending ? "Approving…" : "Approve & send"}
      </button>
      {copyBtn}
      <span className="text-xs text-muted">
        Opens your mail client — review and hit send there. Briefly never sends on its own.
      </span>
    </div>
  );
}
