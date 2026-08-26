"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { MatterChanges } from "@/lib/reviews";

/**
 * "Since the last review" — a compact, evidence-backed card at the top of the
 * matter. Every item is a data-level change (new/changed facts, received
 * documents, resolved or outstanding requirements) traceable to its source; the
 * card never summarises the thread with a model. "Mark reviewed" advances the
 * baseline so the card clears once the professional has seen the changes.
 */

function MarkReviewedButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-inset disabled:opacity-60"
    >
      {pending ? "Saving…" : "Mark reviewed"}
    </button>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</div>
      {children}
    </div>
  );
}

export function SinceReviewCard({
  id,
  changes,
  needsAttention,
  markReviewedAction,
  auto = false,
}: {
  id: string;
  changes: MatterChanges;
  needsAttention: string | null;
  markReviewedAction: (formData: FormData) => void | Promise<void>;
  /** True when the baseline was captured automatically (when Briefly prepared the
   *  brief), not by a human review — the heading says so honestly. */
  auto?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const seg: string[] = [];
  if (changes.newMessages > 0)
    seg.push(`${changes.newMessages} new ${changes.newMessages === 1 ? "message" : "messages"}`);
  if (changes.newFacts.length > 0)
    seg.push(`${changes.newFacts.length} new ${changes.newFacts.length === 1 ? "fact" : "facts"}`);
  if (changes.changedFacts.length > 0)
    seg.push(`${changes.changedFacts.length} ${changes.changedFacts.length === 1 ? "fact changed" : "facts changed"}`);
  if (changes.newDocuments.length > 0)
    seg.push(`${changes.newDocuments.length} ${changes.newDocuments.length === 1 ? "document received" : "documents received"}`);
  if (changes.resolved.length > 0)
    seg.push(`${changes.resolved.length} ${changes.resolved.length === 1 ? "requirement resolved" : "requirements resolved"}`);
  if (changes.stillOutstanding.length > 0)
    seg.push(`${changes.stillOutstanding.length} still outstanding`);

  return (
    <section className="overflow-hidden rounded-xl border border-accent bg-surface">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
            <h2 className="text-base font-semibold tracking-tight">
              {auto ? "Since Briefly prepared this" : "Since the last review"}
            </h2>
          </div>
          <p className="mt-1 text-sm text-muted">
            {seg.length > 0 ? seg.join(" · ") : "No data changes."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-inset"
        >
          {open ? "Hide changes" : "See changes"}
        </button>
        <form action={markReviewedAction}>
          <input type="hidden" name="id" value={id} />
          <MarkReviewedButton />
        </form>
      </div>

      {needsAttention ? (
        <div className="border-t border-awaiting bg-awaiting-soft px-5 py-3 text-sm text-awaiting">
          <span className="font-medium">Needs attention.</span> {needsAttention}
        </div>
      ) : null}

      {open ? (
        <div className="space-y-5 border-t border-border px-5 py-5">
          {changes.newMessages > 0 ? (
            <Group title="New">
              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(new CustomEvent("matter-goto-tab", { detail: "conversation" }))
                }
                className="text-left text-sm text-accent underline decoration-dotted underline-offset-2 hover:text-accent-h"
              >
                {changes.newMessages} new client{" "}
                {changes.newMessages === 1 ? "reply" : "replies"} folded into this matter — read
                the conversation →
              </button>
            </Group>
          ) : null}

          {changes.newFacts.length > 0 ? (
            <Group title="New facts">
              <ul className="rounded-lg border border-border divide-y divide-border">
                {changes.newFacts.map((f, i) => (
                  <li key={i} className="px-4 py-2.5">
                    <div className="text-xs uppercase tracking-wide text-muted">{f.label}</div>
                    <div className="text-sm font-medium">{f.value}</div>
                    {f.source ? (
                      f.carried ? (
                        <div className="mt-0.5 text-xs text-muted">📎 {f.source}</div>
                      ) : (
                        <div className="mt-0.5 text-xs text-muted italic">“{f.source}”</div>
                      )
                    ) : null}
                  </li>
                ))}
              </ul>
            </Group>
          ) : null}

          {changes.newDocuments.length > 0 ? (
            <Group title="Documents received">
              <ul className="space-y-1">
                {changes.newDocuments.map((d, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-accent">✓</span>
                    {d.label}
                  </li>
                ))}
              </ul>
            </Group>
          ) : null}

          {changes.changedFacts.length > 0 ? (
            <Group title="Changed">
              <ul className="rounded-lg border border-border divide-y divide-border">
                {changes.changedFacts.map((f, i) => (
                  <li key={i} className="px-4 py-2.5">
                    <div className="text-xs uppercase tracking-wide text-muted">{f.label}</div>
                    <div className="text-sm">
                      <span className="text-muted line-through">{f.oldValue}</span>
                      <span className="mx-1.5 text-muted">→</span>
                      <span className="font-medium">{f.newValue}</span>
                    </div>
                    {f.source ? (
                      <div className="mt-0.5 text-xs text-muted italic">“{f.source}”</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Group>
          ) : null}

          {changes.resolved.length > 0 ? (
            <Group title="Resolved">
              <ul className="space-y-1">
                {changes.resolved.map((g, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-accent">✓</span>
                    {g.label}
                    <span className="text-xs text-muted">({g.kind})</span>
                  </li>
                ))}
              </ul>
            </Group>
          ) : null}

          {changes.stillOutstanding.length > 0 ? (
            <Group title="Still outstanding">
              <ul className="space-y-1">
                {changes.stillOutstanding.map((g, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-muted">○</span>
                    {g.label}
                    <span className="text-xs text-muted">({g.kind})</span>
                  </li>
                ))}
              </ul>
            </Group>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
