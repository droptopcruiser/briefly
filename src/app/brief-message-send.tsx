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
  stale = false,
}: {
  matterId: string;
  to: string | null;
  initialBody: string;
  /** True when the brief this message belongs to is stale — a client update has
   *  arrived since it was written, so sending it as-is would send superseded
   *  details. Sending is held until the brief is refreshed. */
  stale?: boolean;
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
      {/* The external communication — a paper-like sheet, distinct from the internal
          brief. The mail mark establishes the object: an outbound message for approval. */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-sm)] focus-within:border-accent">
        <div className="flex items-start gap-3 border-b border-border bg-inset px-4 py-3">
          <span aria-hidden="true" className="mt-0.5 shrink-0 text-[22px] leading-none text-accent">
            ✉
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Message to client
            </div>
            <div className="truncate text-sm">
              <span className="text-muted">To:</span> {to ?? "no email on file — use your mail client"}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <span className="shrink-0 text-muted">Subject:</span>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="min-w-0 flex-1 bg-transparent font-medium outline-none"
              />
            </label>
          </div>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={9}
          className="w-full resize-y bg-transparent px-4 py-3.5 text-sm leading-relaxed outline-none"
        />
      </div>

      {/* Stale hold — a client update landed after this was written, so sending it
          as-is would send superseded details. Hold the send behind a refresh; Copy
          stays available for anyone who wants to salvage wording by hand. */}
      {stale ? (
        <div className="space-y-2">
          <p className="flex items-start gap-2 rounded-md border border-awaiting/50 bg-awaiting-soft px-3 py-2 text-xs text-awaiting">
            <span aria-hidden="true" className="mt-px shrink-0">⚠</span>
            <span>
              This draft predates the latest client update — refresh the brief above to
              regenerate it with the current details before sending.
            </span>
          </p>
          <div className="flex items-center gap-3">{copyLink}</div>
        </div>
      ) : (
        <>
          {/* One dominant action; the rest recede to quiet fallbacks. */}
          {to ? (
            <form action={formAction} className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <input type="hidden" name="id" value={matterId} />
              <input type="hidden" name="subject" value={subject} />
              <input type="hidden" name="body" value={body} />
              <button
                type="submit"
                disabled={pending}
                className="btn-primary rounded-md px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
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
              <a href={mailto} className="btn-primary rounded-md px-5 py-2.5 text-sm font-semibold">
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
        </>
      )}
    </div>
  );
}
