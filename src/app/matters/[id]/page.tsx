import Link from "next/link";
import { notFound } from "next/navigation";
import { getMatter } from "@/lib/store";
import { approveMatter, approveAndSendMatter } from "@/app/actions";
import { ReadinessBadge, StatusBadge } from "@/app/ui";
import { ApproveButton } from "@/app/approve-button";
import { DraftActions } from "@/app/draft-actions";
import { requireAccount } from "@/lib/metering";
import { composeEmailBody } from "@/lib/email";

export default async function MatterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const account = await requireAccount();
  const matter = await getMatter(id, account.id);
  if (!matter || !matter.result) notFound();

  const r = matter.result;

  // What the client will actually receive: draft body + the firm's signature (or
  // a default signoff). Used for both the preview and the copy/mail-client draft.
  const emailBody = r.draftEmail
    ? composeEmailBody(r.draftEmail.body, {
        signature: account?.emailSignature,
        firmName: account?.name,
      })
    : null;

  return (
    <div className="space-y-8">
      <Link href="/app" className="text-sm text-muted hover:text-foreground">
        ← All matters
      </Link>

      {/* Header */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {r.clientName ?? "Unnamed client"}
          </h1>
          <ReadinessBadge value={r.readiness} />
          <StatusBadge status={matter.status} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          <span>
            {r.rubricName} · {r.vertical}
          </span>
          <span>Confidence {Math.round(r.classificationConfidence * 100)}%</span>
          <span>
            Cost {r.mocked ? "— (demo)" : `${r.costCents.toFixed(3)}¢`}
          </span>
          {r.clientEmail ? <span>{r.clientEmail}</span> : null}
        </div>
        <p className="max-w-2xl">{r.summary}</p>
      </header>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Extracted facts */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Extracted facts</h2>
          <dl className="rounded-lg border border-border bg-surface divide-y divide-border">
            {r.fields.map((f) => (
              <div key={f.key} className="px-4 py-3">
                <dt className="text-xs uppercase tracking-wide text-muted">{f.label}</dt>
                {f.present ? (
                  <>
                    <dd className="font-medium">{f.value}</dd>
                    {f.source ? (
                      <dd className="mt-1 text-xs text-muted italic">“{f.source}”</dd>
                    ) : null}
                  </>
                ) : (
                  <dd className="text-muted italic">— missing</dd>
                )}
              </div>
            ))}
          </dl>
        </section>

        {/* Timeline */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Timeline</h2>
          {r.timeline.length === 0 ? (
            <p className="text-sm text-muted">No dated events found.</p>
          ) : (
            <ol className="relative space-y-4 border-l border-border pl-5">
              {r.timeline.map((e, i) => (
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
          )}
        </section>
      </div>

      {/* Gaps */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Gaps{" "}
          <span className="text-muted font-normal text-base">
            ({r.gaps.length} missing)
          </span>
        </h2>
        {r.gaps.length === 0 ? (
          <p className="rounded-lg border border-accent bg-surface px-4 py-3 text-sm text-accent">
            Nothing missing — this matter is ready for your review.
          </p>
        ) : (
          <ul className="rounded-lg border border-border bg-surface divide-y divide-border">
            {r.gaps.map((g) => (
              <li key={g.key} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="rounded px-1.5 py-0.5 text-xs border border-border text-muted uppercase">
                  {g.kind}
                </span>
                <span className="font-medium">{g.label}</span>
                <span className="text-muted">— {g.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Drafted next step + human gate */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Drafted next step</h2>
        {r.draftEmail ? (
          <>
            <div className="rounded-lg border border-border bg-surface">
              <div className="border-b border-border px-4 py-2 text-sm">
                <span className="text-muted">To:</span>{" "}
                {r.draftEmail.to ?? "(no client email found — add it in your mail client)"}
                <br />
                <span className="text-muted">Subject:</span> {r.draftEmail.subject}
              </div>
              <pre className="whitespace-pre-wrap px-4 py-3 text-sm font-sans">
                {emailBody}
              </pre>
            </div>
            <DraftActions
              id={matter.id}
              to={r.draftEmail.to}
              subject={r.draftEmail.subject}
              body={emailBody ?? r.draftEmail.body}
              approved={matter.status === "approved"}
              action={approveAndSendMatter}
            />
          </>
        ) : (
          <>
            <p className="rounded-lg border border-accent bg-surface px-4 py-3 text-sm text-accent">
              100% ready — no follow-up needed. Flagged for review.
            </p>
            <div className="flex items-center gap-3 pt-1">
              <ApproveButton
                id={matter.id}
                approved={matter.status === "approved"}
                action={approveMatter}
              />
              <span className="text-xs text-muted">
                Human gate — Briefly never acts on its own.
              </span>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
