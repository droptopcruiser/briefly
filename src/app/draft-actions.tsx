"use client";

import { useActionState, useState } from "react";
import type { SendResult } from "@/app/actions";

/**
 * The "act" step. The drafted subject + body are EDITABLE in place — the
 * professional can tweak wording before sending. "Approve & send" is the gate:
 * it sends exactly what's in the boxes (Postmark, server-side) and marks the
 * matter approved. "Copy draft" and the mail-client link use the edited text too.
 */
export function DraftActions({
  id,
  to,
  initialSubject,
  initialBody,
  approved,
  action,
}: {
  id: string;
  to: string | null;
  initialSubject: string;
  initialBody: string;
  approved: boolean;
  action: (prev: SendResult, formData: FormData) => Promise<SendResult>;
}) {
  const [state, formAction, pending] = useActionState<SendResult, FormData>(action, {
    ok: approved,
  });
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
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
      // Clipboard blocked — no-op.
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

  // Already sent — show the final version read-only.
  if (approved) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-2 text-sm">
            <span className="text-muted">To:</span> {to ?? "—"}
            <br />
            <span className="text-muted">Subject:</span> {subject}
          </div>
          <pre className="whitespace-pre-wrap px-4 py-3 text-sm font-sans">{body}</pre>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-md border border-accent px-4 py-2 text-sm font-medium text-accent">
            ✓ Sent to client
          </span>
          <a
            href={mailto}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-background"
          >
            Reopen in mail client
          </a>
          {copyBtn}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Editable draft */}
      <div className="rounded-lg border border-border bg-surface focus-within:border-accent">
        <div className="flex flex-col gap-1 border-b border-border px-4 py-2 text-sm">
          <div>
            <span className="text-muted">To:</span>{" "}
            {to ?? "(no client email found — send from your own mail client)"}
          </div>
          <label className="flex items-center gap-2">
            <span className="text-muted">Subject:</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="flex-1 bg-transparent font-medium outline-none"
            />
          </label>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={14}
          className="w-full resize-y bg-transparent px-4 py-3 text-sm font-sans outline-none"
        />
      </div>

      {to ? (
        <form action={formAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="subject" value={subject} />
          <input type="hidden" name="body" value={body} />
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
      ) : (
        <div className="space-y-2">
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
            No client email was detected, so Briefly can&apos;t send it for you. Edit above, then
            send from your mail client.
          </p>
        </div>
      )}

      {state.error ? (
        <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>
      ) : to ? (
        <p className="text-xs text-muted">
          Edit the draft above if you like, then approve — Briefly sends exactly what you see to{" "}
          {to}. Nothing goes out without your approval.
        </p>
      ) : null}
    </div>
  );
}
