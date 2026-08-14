import Link from "next/link";
import { notFound } from "next/navigation";
import { getMatter } from "@/lib/store";
import { approveMatter, approveAndSendMatter } from "@/app/actions";
import { approveWorkBrief, refreshWorkBrief, generateWorkBrief, completeBriefJudgment } from "@/app/brief-actions";
import { ReadinessBadge, ReadinessMeter, StatusBadge } from "@/app/ui";
import { ApproveButton } from "@/app/approve-button";
import { DraftActions } from "@/app/draft-actions";
import { WorkBriefCard } from "@/app/work-brief-card";
import { SinceReviewCard } from "@/app/since-review-card";
import { SubmitButton } from "@/app/pending-button";
import { AssignControl } from "@/app/assign-control";
import { requireAccount } from "@/lib/metering";
import { listMembers } from "@/lib/team";
import { listEvents } from "@/lib/events";
import { getActiveBrief, isBriefStale } from "@/lib/work-brief";
import { getBaselineReview, computeMatterChanges } from "@/lib/reviews";
import { getEffectiveRubrics } from "@/lib/rubric-store";
import { getClientContext } from "@/lib/clients";
import { assignMatter, markMatterReviewed } from "@/app/actions";
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

  const members = await listMembers(account.id);
  const assignOptions = members.map((m) => ({
    userId: m.userId,
    label: m.name || m.email || "Teammate",
  }));

  const events = await listEvents(matter.id);
  const clientContext = matter.clientEmail
    ? await getClientContext(account.id, matter.clientEmail, matter.id)
    : null;

  const r = matter.result;
  const carriedCount = r.fields.filter((f) => f.carried).length;

  // Resolve this matter's rubric once — used for the brief opt-out check and for
  // labelling newly-received documents in the "since review" diff.
  const rubrics = await getEffectiveRubrics(account.id);
  const rubric = rubrics.find((x) => x.id === r.rubricId);

  // Path B — a ready matter carries an Initial Work Brief. Load it (and whether a
  // later reply may have made it stale). Only relevant when nothing is missing.
  const brief = !r.draftEmail ? await getActiveBrief(matter.id) : null;
  const briefStale = brief ? isBriefStale(brief, matter) : false;
  const briefsEnabled = !r.draftEmail && !brief ? !rubric || rubric.prepareBriefWhenReady !== false : true;

  // "Since the last review" — diff the matter against its stored baseline. The
  // card shows only when there's a real baseline and something changed (or a
  // prepared artifact may now be stale).
  const baseline = await getBaselineReview(matter.id);
  const changes = baseline ? computeMatterChanges(matter, baseline.snapshot, rubric) : null;
  const needsAttention =
    brief && briefStale
      ? "A client reply has arrived since the brief was prepared — refresh it to include the new information."
      : changes?.readinessDelta && changes.readinessDelta.to < changes.readinessDelta.from
        ? `Readiness fell from ${changes.readinessDelta.from}% to ${changes.readinessDelta.to}% since the last review.`
        : null;
  const showSinceReview = !!changes && (changes.hasChanges || !!needsAttention);

  // A chase Briefly drafted for a stuck matter — awaiting_client + a pending nudge.
  const pendingChase = matter.status === "awaiting_client" && !!matter.lastNudgedAt;
  const daysWaiting = pendingChase
    ? Math.max(1, Math.round((Date.now() - new Date(matter.updatedAt ?? matter.createdAt).getTime()) / 86_400_000))
    : 0;
  // The follow-up has gone out and there's nothing to re-send right now → read-only.
  const alreadySent =
    (matter.status === "awaiting_client" && !matter.lastNudgedAt) || matter.status === "completed";

  // The editable draft the professional will send. Read-only (already sent) shows
  // the exact text that went out (verbatim); otherwise compose draft + signature.
  const emailBody = r.draftEmail
    ? alreadySent
      ? r.draftEmail.body
      : composeEmailBody(r.draftEmail.body, {
          signature: account?.emailSignature,
          firmName: account?.name,
        })
    : null;

  return (
    <div className="space-y-8">
      <Link href="/app/matters" className="text-sm text-muted hover:text-foreground">
        ← Matters
      </Link>

      {/* Since the last review — evidence-backed diff against the stored baseline */}
      {showSinceReview && changes ? (
        <SinceReviewCard
          id={matter.id}
          changes={changes}
          needsAttention={needsAttention}
          markReviewedAction={markMatterReviewed}
        />
      ) : null}

      {/* Header */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {r.clientName ?? "Unnamed client"}
          </h1>
          <ReadinessBadge value={r.readiness} />
          <StatusBadge status={matter.status} />
          <div className="ml-auto flex items-center gap-2">
            {!showSinceReview ? (
              <form action={markMatterReviewed}>
                <input type="hidden" name="id" value={matter.id} />
                <button
                  type="submit"
                  title="Snapshot the matter as it stands, so Briefly can show what changes next"
                  className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:bg-inset hover:text-foreground"
                >
                  Mark reviewed
                </button>
              </form>
            ) : null}
            <AssignControl
              matterId={matter.id}
              members={assignOptions}
              current={matter.assignedTo}
              action={assignMatter}
            />
          </div>
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
        <ReadinessMeter value={r.readiness} className="max-w-2xl" />
      </header>

      {/* Returning client — surfaced prominently, not buried */}
      {clientContext && clientContext.priorCount > 0 ? (
        <section className="flex items-center justify-between gap-4 rounded-lg border border-accent bg-surface px-4 py-3">
          <div>
            <div className="text-sm font-medium">
              Returning client · {r.clientName ?? "Client"} · {clientContext.priorCount} previous{" "}
              {clientContext.priorCount === 1 ? "matter" : "matters"}
            </div>
            {carriedCount > 0 ? (
              <div className="text-xs text-muted">
                Briefly used {carriedCount} known {carriedCount === 1 ? "fact" : "facts"} from
                previous matters.
              </div>
            ) : null}
          </div>
          {clientContext.client ? (
            <Link
              href={`/app/clients/${clientContext.client.id}`}
              className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-inset"
            >
              View client →
            </Link>
          ) : null}
        </section>
      ) : null}

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
                    {f.carried ? (
                      <dd className="mt-1 text-xs text-muted">📎 {f.source}</dd>
                    ) : (
                      <>
                        {f.source ? (
                          <dd className="mt-1 text-xs text-muted italic">“{f.source}”</dd>
                        ) : null}
                        <dd className="mt-0.5 text-xs text-accent">✓ Provided in current enquiry</dd>
                      </>
                    )}
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
            Every required fact and document is present — this matter is ready. The prepared brief is
            below.
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

      {/* Next step + human gate. Path A: a missing-info follow-up to send.
          Path B: the matter is ready → the Initial Work Brief for review. */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {r.draftEmail ? "Drafted next step" : "Prepared work"}
        </h2>

        {/* Briefly noticed this went quiet — a chase is ready below. */}
        {pendingChase ? (
          <div className="rounded-lg border border-awaiting bg-surface px-4 py-3 text-sm">
            <p className="font-medium">
              Briefly noticed this has been waiting {daysWaiting}{" "}
              {daysWaiting === 1 ? "day" : "days"} since your last message.
            </p>
            <p className="mt-1 text-muted">A follow-up is ready below — review and send it.</p>
          </div>
        ) : null}

        {r.draftEmail ? (
          <DraftActions
            id={matter.id}
            to={r.draftEmail.to}
            initialSubject={r.draftEmail.subject}
            initialBody={emailBody ?? r.draftEmail.body}
            approved={alreadySent}
            action={approveAndSendMatter}
          />
        ) : brief ? (
          <div className="space-y-4">
            <WorkBriefCard
              id={matter.id}
              version={brief.version}
              state={brief.state}
              content={brief.content}
              stale={briefStale}
              mocked={brief.mocked}
              approveAction={approveWorkBrief}
              refreshAction={refreshWorkBrief}
              completeAction={completeBriefJudgment}
            />
            {matter.status === "in_progress" ? (
              <form action={approveMatter} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="id" value={matter.id} />
                <button
                  type="submit"
                  className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-inset"
                >
                  Mark matter complete
                </button>
                <span className="text-xs text-muted">Close this matter once the work is done.</span>
              </form>
            ) : matter.status === "completed" ? (
              <p className="text-sm text-accent">✓ Matter completed.</p>
            ) : null}
          </div>
        ) : matter.status === "completed" ? (
          // Legacy matter finalised before briefs existed — no brief to show.
          <p className="rounded-lg border border-accent bg-surface px-4 py-3 text-sm text-accent">
            ✓ Matter completed.
          </p>
        ) : briefsEnabled ? (
          <div className="space-y-3 rounded-lg border border-accent bg-surface px-4 py-4 text-sm">
            <p className="font-medium text-accent">This matter is ready — nothing missing.</p>
            <p className="text-muted">
              Prepare the Initial Work Brief so you can review the matter and decide the next step
              without reconstructing the email thread.
            </p>
            <form action={generateWorkBrief}>
              <input type="hidden" name="id" value={matter.id} />
              <SubmitButton idleLabel="Prepare Initial Work Brief" pendingLabel="Preparing…" />
            </form>
            <p className="text-xs text-muted">
              The source-backed facts appear immediately; the summary and suggested next steps
              finish a moment later.
            </p>
          </div>
        ) : (
          <>
            <p className="rounded-lg border border-accent bg-surface px-4 py-3 text-sm text-accent">
              100% ready — nothing missing. Ready for you to review.
            </p>
            <div className="flex items-center gap-3 pt-1">
              <ApproveButton id={matter.id} approved={false} action={approveMatter} />
              <span className="text-xs text-muted">
                Human gate — Briefly never acts on its own.
              </span>
            </div>
          </>
        )}
      </section>

      {/* Activity trail — the lifecycle over time */}
      {events.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Activity</h2>
          <ol className="relative space-y-4 border-l border-border pl-5">
            {events.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[1.42rem] top-1.5 h-2 w-2 rounded-full bg-accent" />
                <div className="text-sm">{e.detail ?? e.type}</div>
                <div className="text-xs text-muted tabular-nums">
                  {new Date(e.createdAt).toLocaleString()}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
