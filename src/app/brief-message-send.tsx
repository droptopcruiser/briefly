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

  const copyBtn = (
    <button
      type="button"
      onClick={copyDraft}
      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-inset"
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );

  if (state.ok) {
    return (
      <div className="rounded-lg border border-accent bg-surface px-4 py-3 text-sm">
        <span className="font-medium text-accent">✓ Sent to client</span>
        {to ? <span className="text-muted"> · {to}</span> : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-border focus-within:border-accent">
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
          rows={8}
          className="w-full resize-y bg-transparent px-4 py-3 text-sm font-sans outline-none"
        />
      </div>

      {to ? (
        <form action={formAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="id" value={matterId} />
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
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={mailto}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90"
          >
            Send in mail client
          </a>
          {copyBtn}
        </div>
      )}

      {state.error ? (
        <p className="text-xs text-error">{state.error}</p>
      ) : (
        <p className="text-xs text-muted">
          A draft for you — edit if you like, then approve. Briefly sends exactly what you see
          {to ? ` to ${to}` : ""}. Nothing goes out without your approval.
        </p>
      )}
    </div>
  );
}
