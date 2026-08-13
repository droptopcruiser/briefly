"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { WorkBriefContent, WorkBriefState } from "@/lib/work-brief";

/**
 * The Initial Work Brief review surface. Briefly prepares; the professional
 * reviews, then explicitly approves. Factual sections carry their source quotes
 * so every claim is traceable. Approving is an internal step (matter → in
 * progress); the suggested client message is a draft the professional sends
 * themselves — nothing here leaves automatically.
 */

function ApproveSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
    >
      {pending ? "Approving…" : "Approve brief"}
    </button>
  );
}

function RefreshSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-inset disabled:opacity-60"
    >
      {pending ? "Refreshing…" : label}
    </button>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2 text-sm">
          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

export function WorkBriefCard({
  id,
  version,
  state,
  content,
  stale,
  mocked,
  approveAction,
  refreshAction,
}: {
  id: string;
  version: number;
  state: WorkBriefState;
  content: WorkBriefContent;
  stale: boolean;
  mocked: boolean;
  approveAction: (formData: FormData) => void | Promise<void>;
  refreshAction: (formData: FormData) => void | Promise<void>;
}) {
  const approved = state === "approved";
  const [copied, setCopied] = useState(false);

  async function copyMessage() {
    if (!content.suggestedClientMessage) return;
    try {
      await navigator.clipboard.writeText(content.suggestedClientMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-accent bg-surface">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight">Initial Work Brief</h2>
        <span className="rounded-full bg-inset px-2 py-0.5 text-xs text-muted tabular-nums">
          v{version}
        </span>
        {approved ? (
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
            ✓ Approved
          </span>
        ) : (
          <span className="rounded-full border border-awaiting px-2.5 py-1 text-xs font-medium text-awaiting">
            Awaiting your approval
          </span>
        )}
        {mocked ? (
          <span className="text-xs text-muted">Demo draft — set ANTHROPIC_API_KEY for live drafting</span>
        ) : null}
      </div>

      {/* Stale banner */}
      {stale ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-awaiting bg-awaiting-soft px-5 py-3">
          <div className="text-sm text-awaiting">
            <span className="font-medium">Updated since review.</span> New information has arrived on
            this matter — this brief may be out of date.
          </div>
          <form action={refreshAction}>
            <input type="hidden" name="id" value={id} />
            <RefreshSubmit label="Refresh brief" />
          </form>
        </div>
      ) : null}

      <div className="space-y-6 px-5 py-5">
        {/* 1 — Matter summary */}
        <Section title="Matter summary">
          <p className="text-sm">{content.summary}</p>
        </Section>

        {/* 2 + 3 — Key facts, source-backed */}
        {content.keyFacts.length > 0 ? (
          <Section title="Key facts">
            <dl className="rounded-lg border border-border divide-y divide-border">
              {content.keyFacts.map((f, i) => (
                <div key={i} className="px-4 py-3">
                  <dt className="text-xs uppercase tracking-wide text-muted">{f.label}</dt>
                  <dd className="font-medium">{f.value}</dd>
                  {f.source ? (
                    f.carried ? (
                      <dd className="mt-1 text-xs text-muted">📎 {f.source}</dd>
                    ) : (
                      <dd className="mt-1 text-xs text-muted italic">“{f.source}”</dd>
                    )
                  ) : null}
                </div>
              ))}
            </dl>
          </Section>
        ) : null}

        {/* 4 — Documents received */}
        {content.documents.length > 0 ? (
          <Section title="Documents received">
            <ul className="space-y-1.5">
              {content.documents.map((d, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-accent">✓</span>
                  <span className="font-medium">{d.label}</span>
                  {d.satisfies && d.satisfies !== d.label ? (
                    <span className="text-muted">— {d.satisfies}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {/* 5 — Important dates */}
        {content.importantDates.length > 0 ? (
          <Section title="Important dates">
            <ol className="relative space-y-3 border-l border-border pl-5">
              {content.importantDates.map((e, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[1.42rem] top-1.5 h-2 w-2 rounded-full bg-accent" />
                  <div className="text-sm font-medium tabular-nums">{e.date || "Undated"}</div>
                  <div className="text-sm">{e.description}</div>
                  {e.source ? (
                    <div className="mt-0.5 text-xs text-muted italic">“{e.source}”</div>
                  ) : null}
                </li>
              ))}
            </ol>
          </Section>
        ) : null}

        {/* 6 — Outstanding considerations */}
        {content.considerations.length > 0 ? (
          <Section title="Outstanding considerations">
            <Bullets items={content.considerations} />
          </Section>
        ) : null}

        {/* 7 — Rubric-relevant issues */}
        {content.rubricIssues.length > 0 ? (
          <Section title="Issues for consideration">
            <Bullets items={content.rubricIssues} />
          </Section>
        ) : null}

        {/* 8 — Suggested next step */}
        {content.suggestedNextStep ? (
          <Section title="Suggested next step (for professional review)">
            <p className="rounded-lg border border-border bg-inset px-4 py-3 text-sm">
              {content.suggestedNextStep}
            </p>
          </Section>
        ) : null}

        {/* 10 — Questions for the professional */}
        {content.questionsForProfessional.length > 0 ? (
          <Section title="Questions for you">
            <Bullets items={content.questionsForProfessional} />
          </Section>
        ) : null}

        {/* 9 — Suggested client communication (draft only, never auto-sent) */}
        {content.suggestedClientMessage ? (
          <Section title="Suggested client message (draft)">
            <div className="rounded-lg border border-border">
              <pre className="whitespace-pre-wrap px-4 py-3 text-sm font-sans">
                {content.suggestedClientMessage}
              </pre>
              <div className="flex items-center gap-3 border-t border-border px-4 py-2">
                <button
                  type="button"
                  onClick={copyMessage}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-inset"
                >
                  {copied ? "Copied ✓" : "Copy"}
                </button>
                <span className="text-xs text-muted">
                  A draft for you to review and send yourself — Briefly won&apos;t send it.
                </span>
              </div>
            </div>
          </Section>
        ) : null}
      </div>

      {/* Human gate */}
      <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-4">
        {approved ? (
          <>
            <span className="rounded-md border border-accent px-4 py-2 text-sm font-medium text-accent">
              ✓ Brief approved
            </span>
            <form action={refreshAction}>
              <input type="hidden" name="id" value={id} />
              <RefreshSubmit label="Refresh draft" />
            </form>
          </>
        ) : (
          <>
            <form action={approveAction}>
              <input type="hidden" name="id" value={id} />
              <ApproveSubmit />
            </form>
            <form action={refreshAction}>
              <input type="hidden" name="id" value={id} />
              <RefreshSubmit label="Refresh draft" />
            </form>
            <span className="text-xs text-muted">
              Human gate — approving begins the work. Nothing is sent.
            </span>
          </>
        )}
      </div>
    </div>
  );
}
