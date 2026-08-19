"use client";

import { useActionState, useState } from "react";
import { sendBriefMessage } from "@/app/brief-actions";
import type { SendResult } from "@/app/actions";

/**
 * The brief's "Suggested client message" — an editable draft the professional can
 * actually SEND (the human gate is the "Approve & send" click), not just copy.
 * Mirrors the missing-info follow-up send: edit in place, then Briefly sends
 * exactly what's shown. Copy / mail-client remain as fallbacks, and are the only
 * options when no client email is on the matter.
 */
export function BriefMessageSend({
  matterId,
  to,
  initialBody,
}: {
  matterId: string;
  to: string | null;
  initialBody: string;
}) {
  const [state, formAction, pending] = useActionState<SendResult, FormData>(sendBriefMessage, {
    ok: false,
  });
  const [subject, setSubject] = useState("Regarding your enquiry");
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
      /* clipboard blocked */
    }
  }

  const copyLink = (
    <button
      type="button"
      onClick={copyDraft}
      className="text-xs text-muted underline decoration-dotted underline-offset-2 hover:text-foreground"
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );

  if (state.ok) {
    return (
      <div className="rounded-lg border border-accent bg-accent-soft px-4 py-3 text-sm">
        <span className="font-medium text-accent">✓ Sent to client</span>
        {to ? <span className="text-muted"> · {to}</span> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* The external communication — a paper-like sheet, distinct from the internal brief. */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-sm)] focus-within:border-accent">
        <div className="flex items-center gap-2 border-b border-border bg-inset px-4 py-2 text-xs text-muted">
          <span aria-hidden="true">✉</span>
          <span className="font-medium uppercase tracking-wide">Message to client</span>
          <span className="ml-auto truncate">{to ?? "no email on file — use your mail client"}</span>
        </div>
        <label className="flex items-center gap-2 border-b border-border px-4 py-2 text-sm">
          <span className="text-muted">Subject</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="min-w-0 flex-1 bg-transparent font-medium outline-none"
          />
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={9}
          className="w-full resize-y bg-transparent px-4 py-3.5 text-sm leading-relaxed outline-none"
        />
      </div>

      {/* One dominant action; the rest recede to quiet fallbacks. */}
      {to ? (
        <form action={formAction} className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <input type="hidden" name="id" value={matterId} />
          <input type="hidden" name="subject" value={subject} />
          <input type="hidden" name="body" value={body} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg shadow-[var(--shadow-sm)] transition-opacity disabled:opacity-60"
          >
            {pending ? "Sending…" : "Approve & send"}
          </button>
          <div className="flex items-center gap-3">
            {copyLink}
            <a
              href={mailto}
              className="text-xs text-muted underline decoration-dotted underline-offset-2 hover:text-foreground"
            >
              use your mail client
            </a>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={mailto}
            className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg hover:opacity-90"
          >
            Send in mail client
          </a>
          {copyLink}
        </div>
      )}

      {state.error ? (
        <p className="text-xs text-error">{state.error}</p>
      ) : (
        <p className="text-xs text-muted">
          Edit if you like, then approve — Briefly sends exactly what you see
          {to ? ` to ${to}` : ""}. Nothing goes out without your approval.
        </p>
      )}
    </div>
  );
}
