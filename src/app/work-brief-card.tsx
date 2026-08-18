"use client";

import type { WorkBriefContent, WorkBriefState } from "@/lib/work-brief";
import { Spinner } from "@/app/pending-button";
import { BriefMessageSend } from "@/app/brief-message-send";
import { InsightCallout } from "@/app/insight-callout";

/**
 * The Initial Work Brief review surface — PRESENTATIONAL. All state and the
 * server calls live in BriefPanel; this component just renders the brief and
 * calls back on Approve / Refresh. Factual sections carry their source quotes so
 * every claim is traceable. Approving is an internal step (matter → in progress);
 * the suggested client message is a draft the professional sends themselves.
 *
 * Two-phase render: the deterministic facts show immediately; while
 * `content.judgmentPending`, a skeleton holds the judgment sections until the
 * model fills them in.
 */

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

/** Shown while the model-written judgment sections are still being prepared. */
function JudgmentSkeleton() {
  return (
    <div className="space-y-4 rounded-lg border border-dashed border-border bg-inset px-4 py-4">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner />
        <span className="font-medium">Preparing considerations and next steps…</span>
      </div>
      <ul className="space-y-1.5 text-sm">
        <li className="flex items-center gap-2 text-accent">
          <span>✓</span> Reviewed extracted facts and documents
        </li>
        <li className="flex items-center gap-2 text-muted">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />
          Structuring the matter summary and issues
        </li>
        <li className="flex items-center gap-2 text-muted">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />
          Preparing questions and a suggested next step
        </li>
      </ul>
      <div className="space-y-2" aria-hidden="true">
        <div className="h-2.5 w-2/3 animate-pulse rounded bg-border" />
        <div className="h-2.5 w-11/12 animate-pulse rounded bg-border" />
        <div className="h-2.5 w-4/5 animate-pulse rounded bg-border" />
      </div>
    </div>
  );
}

export function WorkBriefCard({
  matterId,
  clientEmail,
  version,
  state,
  content,
  stale,
  mocked,
  approving,
  refreshing,
  onApprove,
  onRefresh,
}: {
  matterId: string;
  clientEmail: string | null;
  version: number;
  state: WorkBriefState;
  content: WorkBriefContent;
  stale: boolean;
  mocked: boolean;
  approving: boolean;
  refreshing: boolean;
  onApprove: () => void;
  onRefresh: () => void;
}) {
  const approved = state === "approved";
  const judgmentPending = !!content.judgmentPending;

  const RefreshButton = ({ label }: { label: string }) => (
    <button
      type="button"
      onClick={onRefresh}
      disabled={refreshing}
      className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-inset disabled:opacity-70"
    >
      {refreshing ? (
        <>
          <Spinner /> Refreshing…
        </>
      ) : (
        label
      )}
    </button>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-accent bg-surface">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight">Next step</h2>
        <span className="rounded-full bg-inset px-2 py-0.5 text-xs text-muted tabular-nums">
          Initial Work Brief · v{version}
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

      {/* Stale banner — versioned, explanatory refresh (never a silent rewrite) */}
      {stale ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-awaiting bg-awaiting-soft px-5 py-3">
          <div className="text-sm text-awaiting">
            <span className="font-medium">Updated since review.</span> New client information has
            arrived since Brief v{version} was created.
          </div>
          <RefreshButton label="Prepare updated brief" />
        </div>
      ) : null}

      <div className="space-y-6 px-5 py-5">
        {/* Briefly noticed — the visible reasoning chain, leads the brief. */}
        {content.insight && typeof content.insight === "object" && content.insight.because ? (
          <InsightCallout insight={content.insight} therefore={content.suggestedNextStep || null} />
        ) : null}

        {/* Context — references the facts, doesn't reprint them (they live in the record). */}
        <Section title="What's arrived">
          <p className="text-sm">{content.summary}</p>
        </Section>

        {/* Next step — shown standalone only when the insight chain isn't carrying it. */}
        {!(content.insight && typeof content.insight === "object" && content.insight.because) &&
        content.suggestedNextStep ? (
          <div className="rounded-lg border border-accent/50 bg-accent/5 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-accent">Next step</div>
            <p className="mt-1 text-sm font-medium">{content.suggestedNextStep}</p>
          </div>
        ) : null}

        {/* Judgment sections: a skeleton until the model fills them in. */}
        {judgmentPending ? <JudgmentSkeleton /> : null}

        {/* Value before explanation: the sendable client message leads (human-gated). */}
        {content.suggestedClientMessage ? (
          <Section title="Suggested client message (draft)">
            <BriefMessageSend
              matterId={matterId}
              to={clientEmail}
              initialBody={content.suggestedClientMessage}
            />
          </Section>
        ) : null}

        {/* Supporting reasoning sits below the action. */}
        {content.considerations.length > 0 ? (
          <Section title="Outstanding considerations">
            <Bullets items={content.considerations} />
          </Section>
        ) : null}

        {content.rubricIssues.length > 0 ? (
          <Section title="Issues for consideration">
            <Bullets items={content.rubricIssues} />
          </Section>
        ) : null}

        {content.questionsForProfessional.length > 0 ? (
          <Section title="Questions for you">
            <Bullets items={content.questionsForProfessional} />
          </Section>
        ) : null}
      </div>

      {/* Human gate. When stale, the refresh CTA lives in the banner above. */}
      <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-4">
        {approved ? (
          <>
            <span className="rounded-md border border-accent px-4 py-2 text-sm font-medium text-accent">
              ✓ Brief approved
            </span>
            {!stale ? <RefreshButton label="Refresh draft" /> : null}
          </>
        ) : judgmentPending ? (
          <span className="inline-flex items-center gap-2 text-sm text-muted">
            <Spinner />
            Finishing the brief before you approve…
          </span>
        ) : (
          <>
            <button
              type="button"
              onClick={onApprove}
              disabled={approving}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-70"
            >
              Approve brief
            </button>
            {!stale ? <RefreshButton label="Refresh draft" /> : null}
            <span className="text-xs text-muted">
              Human gate — approving begins the work. Nothing is sent.
            </span>
          </>
        )}
      </div>
    </div>
  );
}
