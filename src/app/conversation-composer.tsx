"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/app/pending-button";
import { sendConversationMessage, draftConversationReply } from "@/app/brief-actions";

/**
 * The reply box at the foot of the Conversation tab. The professional types (or
 * seeds from Briefly's prepared draft) and Sends — the click is the human gate.
 * Briefly threads the reply into the same mailbox conversation and records it in
 * the log, so it appears in the thread above on refresh. Plain text by design;
 * this is a matter reply, not a full email client.
 */
export function ConversationComposer({
  matterId,
  clientEmail,
  clientName,
}: {
  matterId: string;
  clientEmail: string | null;
  clientName: string | null;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function draft() {
    if (drafting || busy) return;
    setDrafting(true);
    setError(null);
    try {
      const res = await draftConversationReply(matterId);
      if (!res.ok || !res.draft) {
        setError(res.error ?? "Couldn't draft a reply.");
        return;
      }
      setBody(res.draft);
    } finally {
      setDrafting(false);
    }
  }

  if (!clientEmail) {
    return (
      <p className="rounded-lg border border-border bg-inset px-3.5 py-3 text-xs text-muted">
        No client email on this matter — reply from your own mail client.
      </p>
    );
  }

  async function send() {
    if (!body.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await sendConversationMessage(matterId, body);
      if (!res.ok) {
        setError(res.error ?? "Send failed.");
        return;
      }
      setBody("");
      setSent(true);
      setTimeout(() => setSent(false), 2500);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-border bg-surface focus-within:border-accent">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            // ⌘/Ctrl+Enter sends, like most composers.
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void send();
            }
          }}
          rows={3}
          placeholder={clientName ? `Reply to ${clientName}…` : "Write a reply…"}
          className="w-full resize-y bg-transparent px-3.5 py-3 text-sm leading-relaxed outline-none"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-inset px-3 py-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={draft}
              disabled={drafting || busy}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-accent underline decoration-dotted underline-offset-2 hover:text-accent-h disabled:opacity-50"
            >
              {drafting ? (
                <>
                  <Spinner /> Drafting…
                </>
              ) : (
                "✦ Draft with Briefly"
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={send}
            disabled={busy || !body.trim()}
            className="btn-primary inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? (
              <>
                <Spinner /> Sending…
              </>
            ) : (
              "Send"
            )}
          </button>
        </div>
      </div>
      {error ? (
        <p className="text-xs text-error">{error}</p>
      ) : sent ? (
        <p className="text-xs font-medium text-accent">✓ Sent to {clientEmail}</p>
      ) : (
        <p className="text-[11px] text-muted">
          Threads into the same conversation as {clientEmail}. Your firm signature is added
          automatically. ⌘↵ to send.
        </p>
      )}
    </div>
  );
}
