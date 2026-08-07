"use client";

import { useActionState, useState } from "react";
import type { SettingsResult } from "@/app/actions";

/**
 * Outbound settings for a firm: sender name (→ "Briefly on behalf of {Firm}"),
 * an email signature/footer appended to every follow-up, and where client
 * replies should land. A live preview shows the exact sender line.
 */
export function SettingsForm({
  initialName,
  initialSignature,
  initialReplyToMode,
  initialReplyToEmail,
  address,
  intakeAddress,
  action,
}: {
  initialName: string;
  initialSignature: string;
  initialReplyToMode: "" | "firm" | "intake";
  initialReplyToEmail: string;
  address: string;
  intakeAddress: string | null;
  action: (prev: SettingsResult, formData: FormData) => Promise<SettingsResult>;
}) {
  const [name, setName] = useState(initialName);
  const [replyMode, setReplyMode] = useState(initialReplyToMode);
  const [replyEmail, setReplyEmail] = useState(initialReplyToEmail);
  const [state, formAction, pending] = useActionState<SettingsResult, FormData>(action, {
    ok: false,
  });

  const trimmed = name.trim();
  const preview = trimmed
    ? `"Briefly on behalf of ${trimmed}" <${address}>`
    : `Briefly <${address}>`;

  const radio = "mt-0.5 accent-[var(--accent)]";

  return (
    <form action={formAction} className="space-y-8 max-w-xl">
      {/* Sender identity */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="firmName" className="text-sm font-medium">
            Firm name
          </label>
          <input
            id="firmName"
            name="firmName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="e.g. Bennett Immigration Law"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <p className="text-xs text-muted">Shown to clients as the sender of your follow-ups.</p>
        </div>

        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-muted">Emails will send from</div>
          <div className="mt-1 text-sm font-medium break-words">{preview}</div>
        </div>
      </div>

      {/* Signature / footer */}
      <div className="space-y-1.5">
        <label htmlFor="signature" className="text-sm font-medium">
          Email signature
        </label>
        <textarea
          id="signature"
          name="signature"
          defaultValue={initialSignature}
          rows={5}
          maxLength={1000}
          placeholder={"e.g.\nJane Bennett\nBennett Immigration Law\n+64 21 000 000\nThis email is confidential…"}
          className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <p className="text-xs text-muted">
          Appended to the end of every follow-up. Include your name, contact line, and any
          disclaimer. Leave blank for a simple &ldquo;Kind regards, {trimmed || "your firm"}&rdquo;.
        </p>
      </div>

      {/* Reply-To */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">When a client replies, send it to</legend>

        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="radio"
            name="replyToMode"
            value=""
            checked={replyMode === ""}
            onChange={() => setReplyMode("")}
            className={radio}
          />
          <span>
            The sender address
            <span className="block text-xs text-muted">Replies go back to {address}.</span>
          </span>
        </label>

        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="radio"
            name="replyToMode"
            value="firm"
            checked={replyMode === "firm"}
            onChange={() => setReplyMode("firm")}
            className={radio}
          />
          <span className="flex-1">
            My own inbox
            <span className="block text-xs text-muted">Replies go to an address you choose.</span>
            {replyMode === "firm" ? (
              <input
                name="replyToEmail"
                value={replyEmail}
                onChange={(e) => setReplyEmail(e.target.value)}
                placeholder="you@yourfirm.com"
                className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              />
            ) : null}
          </span>
        </label>

        <label
          className={`flex items-start gap-2.5 text-sm ${intakeAddress ? "" : "opacity-50"}`}
        >
          <input
            type="radio"
            name="replyToMode"
            value="intake"
            checked={replyMode === "intake"}
            onChange={() => setReplyMode("intake")}
            disabled={!intakeAddress}
            className={radio}
          />
          <span>
            Back into Briefly
            <span className="block text-xs text-muted">
              {intakeAddress
                ? `Replies arrive at ${intakeAddress} and become matters automatically.`
                : "Available once your intake address is set up."}
            </span>
          </span>
        </label>
      </fieldset>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state.ok ? (
          <span className="text-sm text-accent">Saved ✓</span>
        ) : state.error ? (
          <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span>
        ) : null}
      </div>
    </form>
  );
}
