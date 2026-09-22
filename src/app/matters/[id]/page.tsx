import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMatterById } from "@/lib/store";
import type { Matter } from "@/lib/types";
import { approveMatter, approveAndSendMatter, deleteSampleMatter } from "@/app/actions";
import { StatusChip } from "@/app/ui";
import { StickyNow } from "@/app/sticky-now";
import { ApproveButton } from "@/app/approve-button";
import { DraftActions } from "@/app/draft-actions";
import { BriefPanel } from "@/app/brief-panel";
import { ConsultationPanel } from "@/app/consultation-panel";
import { ConversationComposer } from "@/app/conversation-composer";
import { MatterTabs, GoToTab } from "@/app/matter-tabs";
import { EvidenceDrawer, OpenEvidenceButton } from "@/app/evidence-drawer";
import { UsedInInsightTag } from "@/app/used-in-insight-tag";
import { InsightCallout } from "@/app/insight-callout";
import { DecisionPane } from "@/app/decision-pane";
import { workflowStatus, statusTone, firstSentence, factSlug } from "@/lib/matter-status";
import { formatWhen, formatInstant } from "@/lib/format";
import { listDocuments } from "@/lib/documents";
import {
  DocumentUpload,
  DeleteDocButton,
  ReadNowButton,
  PendingFactRow,
  ReadingPoller,
} from "@/app/document-upload";
import { SinceReviewCard } from "@/app/since-review-card";
import { AssignControl } from "@/app/assign-control";
import { requireAccount, type Account } from "@/lib/metering";
import { listMembers } from "@/lib/team";
import { listEvents } from "@/lib/events";
import { getActiveBrief, isBriefStale } from "@/lib/work-brief";
import { getActivePacket, isPacketStale } from "@/lib/consultation-packet";
import { getBaselineReview, computeMatterChanges } from "@/lib/reviews";
import { getEffectiveRubrics } from "@/lib/rubric-store";
import { getClientContext } from "@/lib/clients";
import { assignMatter, markMatterReviewed } from "@/app/actions";
import { composeEmailBody, replySubject } from "@/lib/email";
import { parseConversation } from "@/lib/conversation";
import { listMessages } from "@/lib/messages";
import { getMatterDateDecisions, staleDatesEnabled } from "@/lib/critical-dates";
import { resolveMatterDates } from "@/lib/critical-date-derive";
import { CriticalDatesStrip } from "@/app/critical-dates-strip";
import { isMigrationMatter, migrationMatterTitle, groupByPerson, type Party } from "@/lib/migration";
import { getBook } from "@/lib/migration-books";
import { buildMigrationGaps } from "@/lib/migration-gaps";
import { fillDatesFromText, slotStatus, staleSlotKeys, datesStrip } from "@/lib/migration-dates";
import { extractMigration } from "@/lib/migration-extract";
import { buildConsultationPacket } from "@/lib/migration-packet";
import { PacketControls } from "@/app/packet-controls";
import { MigrationDocuments } from "@/app/migration-docs";
import { MigrationRoutingBanner } from "@/app/migration-routing-banner";
import { migrationSinceReview } from "@/lib/migration-review";
import type { MigrationProfile, Gap } from "@/lib/types";

/**
 * Evidence over confidence: show how much of the matter is backed by source
 * material and how much needs a human eye (carried-forward or unsourced facts),
 * instead of an unexplained confidence percentage.
 */
function evidenceLabel(
  fields: { present: boolean; value: string | null; source: string | null; carried?: boolean }[],
): string {
  const sourced = fields.filter((f) => f.present && f.value && f.source && !f.carried).length;
  const review = fields.filter((f) => f.present && f.value && (f.carried || !f.source)).length;
  const parts = [`${sourced} ${sourced === 1 ? "fact" : "facts"} sourced`];
  if (review > 0) parts.push(`${review} ${review === 1 ? "item needs" : "items need"} your review`);
  return parts.join(" · ");
}

/**
 * Matter detail. Only the essentials (account + the matter row) block the first
 * render — the header, extracted facts, timeline, and gaps all come from
 * `matter.result`, so they paint as soon as the row loads. Everything that needs
 * further queries (assignee, returning-client context, the "since review" diff,
 * the prepared-work artifact, the activity trail) streams in behind its own
 * Suspense boundary, so no secondary query blocks the first useful view.
 */

// --- Deferred, independently-streamed sections ------------------------------

async function AssignSection({ matter }: { matter: Matter }) {
  const t = Date.now();
  const members = await listMembers(matter.accountId ?? "");
  console.log(`[matter-timing] listMembers ms=${Date.now() - t}`);
  const options = members.map((m) => ({ userId: m.userId, label: m.name || m.email || "Teammate" }));
  return (
    <AssignControl
      matterId={matter.id}
      members={options}
      current={matter.assignedTo}
      action={assignMatter}
    />
  );
}

async function SinceReviewSection({ matter, accountId }: { matter: Matter; accountId: string }) {
  const t = Date.now();
  const [baseline, rubrics] = await Promise.all([
    getBaselineReview(matter.id),
    getEffectiveRubrics(accountId),
  ]);
  console.log(`[matter-timing] since-review (baseline+rubrics) ms=${Date.now() - t}`);
  if (!baseline) return null;
  const rubric = rubrics.find((x) => x.id === matter.result?.rubricId);
  const changes = computeMatterChanges(matter, baseline.snapshot, rubric);

  const brief = matter.result && !matter.result.draftEmail ? await getActiveBrief(matter.id) : null;
  const briefStale = brief ? isBriefStale(brief, matter) : false;
  const needsAttention =
    brief && briefStale
      ? "A client reply has arrived since the brief was prepared — refresh it to include the new information."
      : changes.readinessDelta && changes.readinessDelta.to < changes.readinessDelta.from
        ? `Readiness fell from ${changes.readinessDelta.from}% to ${changes.readinessDelta.to}% since the last review.`
        : null;
  if (!changes.hasChanges && !needsAttention) return null;

  return (
    <SinceReviewCard
      id={matter.id}
      changes={changes}
      needsAttention={needsAttention}
      markReviewedAction={markMatterReviewed}
      auto={baseline.reviewedBy === null}
      staleBrief={!!(brief && briefStale)}
    />
  );
}

async function CriticalDatesSection({ matter }: { matter: Matter }) {
  const decisions = await getMatterDateDecisions(matter.id);
  const dates = resolveMatterDates(matter.result, decisions, { staleEnabled: staleDatesEnabled() });
  if (dates.length === 0) return null;
  return <CriticalDatesStrip matterId={matter.id} dates={dates} />;
}

async function ReturningClientSection({ matter }: { matter: Matter }) {
  if (!matter.clientEmail) return null;
  const t = Date.now();
  const ctx = await getClientContext(matter.accountId ?? "", matter.clientEmail, matter.id);
  console.log(`[matter-timing] clientContext ms=${Date.now() - t}`);
  if (!ctx || ctx.priorCount === 0) return null;
  const carriedCount = matter.result?.fields.filter((f) => f.carried).length ?? 0;
  return (
    <section className="flex items-center justify-between gap-4 rounded-lg border border-accent bg-surface px-4 py-3">
      <div>
        <div className="text-sm font-medium">
          Returning client · {matter.result?.clientName ?? "Client"} · {ctx.priorCount} previous{" "}
          {ctx.priorCount === 1 ? "matter" : "matters"}
        </div>
        {carriedCount > 0 ? (
          <div className="text-xs text-muted">
            Briefly used {carriedCount} known {carriedCount === 1 ? "fact" : "facts"} from previous
            matters.
          </div>
        ) : null}
      </div>
      {ctx.client ? (
        <Link
          href={`/app/clients/${ctx.client.id}`}
          className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-inset"
        >
          View client →
        </Link>
      ) : null}
    </section>
  );
}

/**
 * THE "NOW" — the matter's centre of gravity. A compact synthesis at the top of the
 * page: what's happening now, what's next, the workflow status, a preview of the
 * most valuable prepared action, and a single button into the tab where it lives.
 * Not another long summary — it carries the decision; the tabs carry the detail.
 */
async function OverviewSection({ matter, account }: { matter: Matter; account: Account }) {
  const r = matter.result!;
  const isMig = isMigrationMatter(r);
  const [brief, packet, rubrics] = await Promise.all([
    r.draftEmail ? Promise.resolve(null) : getActiveBrief(matter.id),
    getActivePacket(matter.id),
    getEffectiveRubrics(account.id),
  ]);
  const rubric = rubrics.find((x) => x.id === r.rubricId);
  const upcoming =
    !!matter.consultationAt && new Date(matter.consultationAt).getTime() > Date.now();
  // The plan is "ready" only once it's prepared AND the professional marked it ready
  // for the meeting — that's what makes the matter "ready for the consultation".
  const planReady = !!packet && packet.state === "approved";
  const status = workflowStatus(matter, rubric, planReady);

  // Guard against older insight shapes (string, or the earlier because/basedOn form).
  const rawInsight = brief?.content.insight;
  const insight =
    rawInsight && typeof rawInsight === "object" && rawInsight.consequence ? rawInsight : null;
  const now = firstSentence(r.summary);
  const next =
    brief?.content.suggestedNextStep?.trim() ||
    rubric?.nextActionIntent?.trim() ||
    (r.draftEmail
      ? "Review and send the follow-up to the client."
      : matter.status === "completed"
        ? "This matter is complete."
        : "Review what Briefly has prepared.");

  // The prepared client message is the VEHICLE for the decision. Path A is the
  // follow-up (a full editor in Next step); Path B is the brief's message, sendable
  // right here so the professional can act without hunting for it.
  const draftPreview = r.draftEmail?.body?.trim() || null;
  const briefMessage = !r.draftEmail ? brief?.content.suggestedClientMessage?.trim() || null : null;

  const prepared: string[] = [];
  if (r.draftEmail) prepared.push("a client follow-up");
  if (brief) prepared.push("an Initial Work Brief");
  if (packet) prepared.push("a consultation plan");
  const preparedLine =
    prepared.length > 0
      ? `Briefly prepared ${prepared.length === 1 ? prepared[0] : prepared.slice(0, -1).join(", ") + " and " + prepared.slice(-1)}.`
      : null;

  const completed = matter.status === "completed";
  // A reply that arrived AFTER the brief was prepared means the narrative below
  // (context, decision, figures) may quote superseded values — the record stays
  // current, the brief prose doesn't. Say so plainly rather than mislead.
  const briefStale = !!brief && isBriefStale(brief, matter);

  // The compact bar shown once the full hero scrolls under the header.
  const compactBar = (
    <div className="flex items-center gap-3">
      <StatusChip label={status} tone={statusTone(matter)} />
      <span className="min-w-0 flex-1 truncate text-sm text-muted">{completed ? matter.clientName : next}</span>
      <OpenEvidenceButton className="hidden rounded-md border border-border px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-inset hover:text-foreground sm:inline-flex">
        <span aria-hidden="true">▤</span>
        <span className="sr-only">Open evidence</span>
      </OpenEvidenceButton>
      {!completed ? (
        <GoToTab tab="next">
          {r.draftEmail || briefMessage ? "Review & send →" : "Review →"}
        </GoToTab>
      ) : null}
    </div>
  );

  return (
    <StickyNow bar={compactBar}>
    <section className="relative">
      {/* The prepared brief as one floating frosted-glass panel on the ambient
          ground — a single considered object. Frost kept readable for legal copy. */}
      <div className="glass-card glass-sheen relative space-y-5 rounded-3xl p-6 sm:p-8">

      {/* ONE current state — not four competing "ready" labels. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-2 font-semibold text-accent">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
          {status}
        </span>
        {upcoming && matter.consultationAt ? (
          <span className="text-muted" suppressHydrationWarning>
            · consultation {formatWhen(matter.consultationAt, { compact: true })}
          </span>
        ) : null}
      </div>

      {/* Stale guard — a reply landed after this was prepared, so the figures in the
          narrative below may be superseded (the record is always current). A light
          inline note right where the stale text sits; the diff + refresh live above. */}
      {!completed && briefStale ? (
        <p className="flex items-start gap-2 border-l-2 border-awaiting pl-3 text-xs text-awaiting">
          <span aria-hidden="true" className="mt-px shrink-0">⚠</span>
          <span>
            A reply arrived after this was prepared — figures below may be superseded.
            The matter record is current.
          </span>
        </p>
      ) : null}

      {/* Briefly noticed — flat on the workspace, the connected factors. */}
      {insight ? (
        <InsightCallout insight={insight} />
      ) : (
        <p className="text-base text-muted">{now}</p>
      )}

      {/* The decision — a floating light focus lens. The consequence sits quietly
          beneath, and "what follows once you decide" is folded in as its footer, so
          the decision and its outcome read as one coherent unit. */}
      {!completed ? (
        <DecisionPane
          consequence={insight?.consequence ?? null}
          footer={
            insight?.afterThis ? (
              <p className="text-xs text-muted">
                <span className="font-medium text-foreground/70">When confirmed:</span>{" "}
                {insight.afterThis}
              </p>
            ) : null
          }
        >
          {next}
        </DecisionPane>
      ) : null}

      {/* WHAT NEEDS YOUR ATTENTION — a compact situational summary, NOT the message.
          It explains the state of the matter; the one editable message sheet, its
          subject and recipient all live only in Next step. One action opens it. */}
      {!completed && !r.draftEmail ? (
        <div className="space-y-2 rounded-lg border border-border bg-inset px-4 py-3.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            What needs your attention
          </div>
          <p className="text-sm leading-relaxed text-foreground/80">
            {insight?.attention?.trim() || r.summary}
          </p>
          <GoToTab tab="next">Review prepared request →</GoToTab>
        </div>
      ) : null}

      {/* Path A — the follow-up's full editor lives in Next step. On migration the
          per-person chase is the ONE chase (in Next step), so no duplicate preview here. */}
      {!completed && !isMig && r.draftEmail ? (
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-sm)]">
          <div className="flex items-center gap-2 border-b border-border bg-inset px-4 py-2 text-xs text-muted">
            <span aria-hidden="true">✉</span>
            <span className="font-medium uppercase tracking-wide">Prepared follow-up</span>
          </div>
          {draftPreview ? (
            <p className="line-clamp-3 whitespace-pre-line px-4 py-3 text-sm text-foreground/90">{draftPreview}</p>
          ) : null}
          <div className="border-t border-border px-4 py-2.5">
            <GoToTab tab="next">Review &amp; send the follow-up →</GoToTab>
          </div>
        </div>
      ) : null}

      {/* A quiet provenance line — the artifact Briefly prepared. It must not compete
          with the decision or the action above; consultation planning is the NEXT
          lifecycle stage and lives in its own tab, not as a rival action here. */}
      {!completed && brief ? (
        <p className="text-xs text-muted">
          Briefly prepared an Initial Work Brief · v{brief.version}
          {briefStale ? " · update available" : ""}
        </p>
      ) : preparedLine ? (
        <p className="text-xs text-muted">{preparedLine}</p>
      ) : null}
      </div>
    </section>
    </StickyNow>
  );
}

/**
 * NEXT STEP — the current decision. Path A (missing info) is the drafted follow-up
 * to review and send; Path B (ready) is the Initial Work Brief, reframed to lead
 * with the next step and NOT reprint the facts (those live in the record).
 */
async function NextStepSection({ matter, account }: { matter: Matter; account: Account }) {
  const r = matter.result!;
  // The default outbound subject: the conversation's "Re:" subject when this matter
  // came in by email, so what's shown is what threads (and what gets sent).
  const threadSubject = r.emailThread?.subject ? replySubject(r.emailThread.subject) : null;

  // A chase Briefly drafted for a stuck matter — awaiting_client + a pending nudge.
  const pendingChase = matter.status === "awaiting_client" && !!matter.lastNudgedAt;
  const daysWaiting = pendingChase
    ? Math.max(1, Math.round((Date.now() - new Date(matter.updatedAt ?? matter.createdAt).getTime()) / 86_400_000))
    : 0;
  const chaseNotice = pendingChase ? (
    <div className="rounded-lg border border-awaiting bg-surface px-4 py-3 text-sm">
      <p className="font-medium">
        Briefly noticed this has been waiting {daysWaiting} {daysWaiting === 1 ? "day" : "days"} since
        your last message.
      </p>
      <p className="mt-1 text-muted">A follow-up is ready below — review and send it.</p>
    </div>
  ) : null;

  // Path A — a missing-info follow-up to review and send.
  if (r.draftEmail) {
    const alreadySent =
      (matter.status === "awaiting_client" && !matter.lastNudgedAt) || matter.status === "completed";
    const body = alreadySent
      ? r.draftEmail.body
      : composeEmailBody(r.draftEmail.body, { signature: account.emailSignature, firmName: account.name });
    return (
      <div className="space-y-4">
        {chaseNotice}
        <DraftActions
          id={matter.id}
          to={r.draftEmail.to}
          initialSubject={threadSubject ?? r.draftEmail.subject}
          initialBody={body}
          approved={alreadySent}
          action={approveAndSendMatter}
        />
      </div>
    );
  }

  // Path B — the matter is ready → the Initial Work Brief.
  const t = Date.now();
  const [brief, rubrics] = await Promise.all([
    getActiveBrief(matter.id),
    getEffectiveRubrics(account.id),
  ]);
  console.log(`[matter-timing] next-step (brief+rubrics) ms=${Date.now() - t}`);
  const rubric = rubrics.find((x) => x.id === r.rubricId);
  const briefsEnabled = !brief ? !rubric || rubric.prepareBriefWhenReady !== false : true;
  const briefStale = brief ? isBriefStale(brief, matter) : false;

  if (briefsEnabled) {
    return (
      <BriefPanel
        matterId={matter.id}
        clientEmail={matter.clientEmail}
        initialBrief={brief}
        initialStatus={matter.status}
        initialStale={briefStale}
        briefsEnabled={briefsEnabled}
        threadSubject={threadSubject}
      />
    );
  }
  if (matter.status === "completed") {
    return (
      <p className="rounded-lg border border-accent bg-surface px-4 py-3 text-sm text-accent">
        ✓ Matter completed.
      </p>
    );
  }
  return (
    <div>
      <p className="rounded-lg border border-accent bg-surface px-4 py-3 text-sm text-accent">
        100% ready — nothing missing. Ready for you to review.
      </p>
      <div className="flex items-center gap-3 pt-1">
        <ApproveButton id={matter.id} approved={false} action={approveMatter} />
        <span className="text-xs text-muted">Human gate — Briefly never acts on its own.</span>
      </div>
    </div>
  );
}

/**
 * CONSULTATION PLAN — always available. If no plan exists yet it shows the prepare
 * prompt (date optional); for an incomplete matter it plans around what's known and
 * surfaces the gaps rather than pretending the matter is done.
 */
async function ConsultationPlanSection({ matter }: { matter: Matter }) {
  const r = matter.result!;
  const packet = await getActivePacket(matter.id);
  return (
    <ConsultationPanel
      matterId={matter.id}
      initialConsultationAt={matter.consultationAt}
      initialPacket={packet}
      initialStale={packet ? isPacketStale(packet, matter) : false}
      incomplete={r.readiness < 100}
      missing={r.gaps.map((g) => ({ label: g.label, kind: g.kind }))}
    />
  );
}

/**
 * CONVERSATION — the actual client thread as a two-sided chat: the client's
 * messages left, what the firm sent right. Reads the message log; falls back to
 * the client side parsed from the submission for matters that predate the log.
 */
async function ConversationSection({ matter, account }: { matter: Matter; account: Account }) {
  const logged = await listMessages(matter.id);
  const thread: {
    direction: "inbound" | "outbound";
    subject: string | null;
    text: string;
    date: string | null;
    attachments: { fileName: string; docId: string }[];
  }[] =
    logged.length > 0
      ? logged.map((m) => ({
          direction: m.direction,
          subject: m.subject,
          text: m.body,
          // A real send/receive instant → the firm's own clock, not the server's.
          date: formatInstant(m.createdAt, account.timezone),
          attachments: m.attachments,
        }))
      : parseConversation(matter.submission).map((m) => ({
          direction: "inbound" as const,
          subject: m.subject,
          text: m.text,
          date: m.date,
          attachments: [],
        }));
  const clientName = matter.clientName ?? "Client";

  const composer = (
    <ConversationComposer
      matterId={matter.id}
      clientEmail={matter.clientEmail}
      clientName={matter.clientName}
    />
  );

  if (thread.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">No messages on this matter yet — start the conversation below.</p>
        {composer}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm text-muted">
          The full thread — the client&apos;s messages on the left, your replies on the right.
        </p>
        <span className="shrink-0 text-xs text-muted">
          {thread.length} {thread.length === 1 ? "message" : "messages"}
        </span>
      </div>
      <div className="space-y-4">
        {thread.map((m, i) => {
          const out = m.direction === "outbound";
          return (
            <div key={i} className={`flex ${out ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[80%] space-y-1">
                <div className={`flex items-center gap-1.5 px-1 text-[11px] text-muted ${out ? "justify-end" : ""}`}>
                  <span className="font-medium text-foreground/70">{out ? "You" : clientName}</span>
                  {m.date ? <span className="tabular-nums">· {m.date}</span> : null}
                </div>
                <div
                  className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-[var(--shadow-sm)] ${
                    out
                      ? "rounded-br-md bg-accent-soft text-foreground"
                      : "rounded-bl-md border border-border bg-surface text-foreground/90"
                  }`}
                >
                  {m.subject && !out ? (
                    <div className="mb-1 text-[11px] text-muted">Subject: {m.subject}</div>
                  ) : null}
                  <p className="whitespace-pre-line">{m.text}</p>
                  {m.attachments.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.attachments.map((att) => (
                        <a
                          key={att.docId}
                          href={`/api/documents/${att.docId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Open ${att.fileName}`}
                          className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-surface/70 px-2 py-1 text-[11px] font-medium text-foreground/80 transition-colors hover:border-accent hover:text-accent"
                        >
                          <span aria-hidden="true">📎</span>
                          <span className="truncate">{att.fileName}</span>
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* The reply composer — where you answer the client without leaving Briefly. */}
      <div className="pt-1">{composer}</div>
    </div>
  );
}

/**
 * A gap's workflow consequence, generated at display time from the matter's own
 * rubric — so old matters (whose stored reason predates this) show it too. Grounded
 * (names the firm's rulebook + the next stage), honest about documents (referenced,
 * not read), and never invented advice.
 */
function gapConsequence(rubricName: string, kind: "field" | "document"): string {
  return kind === "document"
    ? `Required by the ${rubricName} rulebook — the client hasn't referenced it yet; needed before the matter can move to review.`
    : `Required by the ${rubricName} rulebook — the matter can't be marked ready until this is confirmed.`;
}

/** Human file size, e.g. "1.4 MB". */
function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Attached files — real uploaded documents (Slice 1). Honest status: stored, NOT
 * read. Content reading + page-cited facts land in Slice 2.
 */
async function AttachedFilesSection({ matter }: { matter: Matter }) {
  const docs = await listDocuments(matter.id);
  const anyReading = docs.some((d) => d.status === "reading");
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold tracking-tight">Attached files</h2>
      <p className="text-xs text-muted">
        Stored securely in your region. Small PDFs a client emails in are read automatically;
        otherwise use <span className="font-medium">Read now</span> — nothing is added to the matter
        until you confirm each fact.
      </p>
      {/* While a background read is in flight, refresh so facts appear when it lands. */}
      {anyReading ? <ReadingPoller /> : null}
      {docs.length > 0 ? (
        <ul className="space-y-3">
          {docs.map((d) => {
            const statusLabel =
              d.status === "read"
                ? d.pendingFacts.length > 0
                  ? `read · ${d.pendingFacts.length} for review`
                  : "read"
                : d.status === "unreadable"
                  ? "couldn't read"
                  : d.status === "reading"
                    ? null
                    : "attached · not yet read";
            return (
              <li key={d.id} className="overflow-hidden rounded-lg border border-border bg-surface">
                <div className="flex items-center gap-2 px-4 py-3 text-sm">
                  <span aria-hidden="true" className="text-muted">▤</span>
                  <span className="min-w-0 truncate font-medium">{d.fileName}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {fileSize(d.sizeBytes)}
                    {d.pageCount ? ` · ${d.pageCount} pp` : ""}
                  </span>
                  {statusLabel ? (
                    <span className="ml-auto shrink-0 text-xs font-medium text-muted">{statusLabel}</span>
                  ) : (
                    <span className="ml-auto" />
                  )}
                  <ReadNowButton matterId={matter.id} docId={d.id} status={d.status} />
                  <DeleteDocButton matterId={matter.id} docId={d.id} fileName={d.fileName} />
                </div>

                {/* Sleek reading state — the visible surface of the background read. */}
                {d.status === "reading" ? (
                  <div className="flex items-center gap-2.5 border-t border-border bg-inset/60 px-4 py-3 text-xs font-medium text-accent">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                    </span>
                    <span className="animate-pulse">
                      Briefly is reading this document — extracting the facts…
                    </span>
                  </div>
                ) : null}

                {d.pendingFacts.length > 0 ? (
                  <div className="border-t border-border bg-inset/50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">
                      Document evidence found — awaiting your confirmation
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      Nothing affects the matter until you confirm it.
                    </p>
                    <ul className="mt-2 divide-y divide-border">
                      {d.pendingFacts.map((f) => (
                        <PendingFactRow key={f.id} matterId={matter.id} docId={d.id} fact={f} />
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">No files attached yet.</p>
      )}
      <DocumentUpload matterId={matter.id} />
    </section>
  );
}

/** Prettify a rubric document key when no label is to hand (e.g. "title_deed"). */
function humanizeKey(key: string): string {
  const s = key.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * MATTER RECORD — the single source of truth: source-backed facts, documents,
 * timeline, and gaps. Every other view references these without repeating them.
 */
async function RecordPanel({ matter, timezone }: { matter: Matter; timezone: string | null }) {
  const r = matter.result!;

  // Migration: the proof drawer, grouped by the SAME people as the cover tiles — never
  // the old single-applicant rubric keys (which read "Applicant full name — missing"
  // when the names are right there on the cover). No "Spousal Visa Application" noun.
  const migration = isMigrationMatter(r) ? r.migration ?? null : null;
  if (migration) {
    const sub = matter.submission ?? "";
    const book = getBook(migration.stream);
    const facts = extractMigration(sub).facts;
    const docs = await listDocuments(matter.id);
    const attached = new Set(docs.filter((d) => d.personId && d.itemKey).map((d) => `${d.itemKey}:${d.personId}`));
    const liveGaps = book ? buildMigrationGaps(book, migration, sub, attached).gaps : r.gaps;
    const slots = book ? fillDatesFromText(buildMigrationGaps(book, migration, sub).dateSlots, sub, migration) : [];
    const factGroups = groupByPerson(migration, facts).filter((g) => g.items.length);
    const gapGroups = groupByPerson(migration, liveGaps).filter((g) => g.items.length);
    const dated = slots.map((s) => ({ s, st: slotStatus(s) })).filter((x) => x.st.state !== "empty");
    const who = (party: Party | null) => (party ? party.name : "Unassigned");
    return (
      <div className="space-y-8">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">On file</h2>
          {factGroups.length === 0 ? (
            <p className="text-sm text-muted">No sourced facts captured yet.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {factGroups.map((g, i) => (
                <div key={i} className="rounded-lg border border-border bg-surface p-4">
                  <div className="text-sm font-medium">{who(g.party)}</div>
                  <dl className="mt-2 space-y-2">
                    {g.items.map((f) => (
                      <div key={f.key} data-evi-fact={factSlug(f.label)}>
                        <dt className="text-xs uppercase tracking-wide text-muted">{f.label}</dt>
                        <dd className="font-medium">{f.value}</dd>
                        {f.source ? <dd className="mt-0.5 text-xs italic text-foreground/70">“{f.source}”</dd> : null}
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          )}
        </section>

        {dated.length ? (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">Dates on file</h2>
            <ul className="rounded-lg border border-border bg-surface divide-y divide-border text-sm">
              {dated.map(({ s, st }) => (
                <li key={s.key} className="px-4 py-3">
                  <div className="font-medium">{slotLabel(migration, s.personId, s.itemKey)}</div>
                  {st.state === "set" ? (
                    <div className="text-foreground/80"><span className="tabular-nums">{fmtISO(st.value)}</span> — <span className="italic text-foreground/70">“{st.source}”</span></div>
                  ) : st.state === "conflict" ? (
                    <ul className="mt-0.5 space-y-0.5 text-awaiting">
                      {st.candidates.map((c, j) => (
                        <li key={j}><span className="tabular-nums">{fmtISO(c.value)}</span> — <span className="italic">“{c.source}”</span></li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <Suspense fallback={<div className="h-16 animate-pulse rounded-lg border border-border bg-surface" />}>
          <AttachedFilesSection matter={matter} />
        </Suspense>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Outstanding <span className="text-muted font-normal text-base">({liveGaps.length})</span>
          </h2>
          {gapGroups.length === 0 ? (
            <p className="rounded-lg border border-accent bg-surface px-4 py-3 text-sm text-accent">Nothing outstanding — ready to lodge.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {gapGroups.map((g, i) => (
                <div key={i} className={`rounded-lg border p-4 ${g.party ? "border-border bg-surface" : "border-awaiting/40 bg-awaiting-soft"}`}>
                  <div className={`text-sm font-medium ${g.party ? "" : "text-awaiting"}`}>{who(g.party)}</div>
                  <ul className="mt-1.5 space-y-1 text-sm text-foreground/85">
                    {g.items.map((gap) => <li key={gap.key}>· {gap.label}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <Suspense fallback={null}>
          <ActivitySection matterId={matter.id} timezone={timezone} />
        </Suspense>
      </div>
    );
  }

  const outstandingDocs = r.gaps.filter((g) => g.kind === "document");

  // Which facts fed the "Briefly noticed" insight — so the record can point back.
  const brief = await getActiveBrief(matter.id);
  const usedSlugs = new Set<string>();
  const ins = brief?.content.insight;
  if (ins && typeof ins === "object" && Array.isArray(ins.factors)) {
    for (const f of ins.factors as { sources?: { label: string }[] }[]) {
      for (const s of f.sources ?? []) usedSlugs.add(factSlug(s.label));
    }
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-8 md:grid-cols-2">
        {/* Extracted facts */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Extracted facts</h2>
          <dl className="rounded-lg border border-border bg-surface divide-y divide-border">
            {r.fields.map((f) => (
              <div key={f.key} data-evi-fact={factSlug(f.label)} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <dt className="text-xs uppercase tracking-wide text-muted">{f.label}</dt>
                  {usedSlugs.has(factSlug(f.label)) ? <UsedInInsightTag slug={factSlug(f.label)} /> : null}
                </div>
                {f.present ? (
                  <>
                    <dd className="font-medium">{f.value}</dd>
                    {f.fromDocument ? (
                      <dd className="mt-1 text-xs text-foreground/70">
                        ▤ {f.fromDocument.fileName}
                        {f.fromDocument.page !== null
                          ? ` · p.${f.fromDocument.page}`
                          : " · scan, not page-verified"}
                      </dd>
                    ) : f.carried ? (
                      <dd className="mt-1 text-xs text-foreground/70">📎 {f.source}</dd>
                    ) : (
                      <>
                        {f.source ? (
                          <dd className="mt-1 text-sm italic text-foreground/85">“{f.source}”</dd>
                        ) : null}
                        <dd className="mt-1 text-xs font-medium text-accent">✓ Provided in current enquiry</dd>
                      </>
                    )}
                  </>
                ) : (
                  <dd className="text-sm italic text-muted">— missing</dd>
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
                    <div className="mt-0.5 text-sm italic text-foreground/85">“{e.source}”</div>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* Documents */}
      {r.documentsPresent.length > 0 || outstandingDocs.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold tracking-tight">Documents</h2>
          <p className="text-xs text-muted">
            Detected from the client&apos;s message — Briefly hasn&apos;t opened the files. Confirm each
            attachment on review.
          </p>
          <ul className="rounded-lg border border-border bg-surface divide-y divide-border">
            {r.documentsPresent.map((k) => (
              <li key={k} className="flex items-center gap-2 px-4 py-3 text-sm">
                <span className="text-accent">✓</span>
                <span className="font-medium">{humanizeKey(k)}</span>
                <span className="ml-auto text-xs font-medium text-accent">referenced by client</span>
              </li>
            ))}
            {outstandingDocs.map((g) => (
              <li key={g.key} className="flex items-center gap-2 px-4 py-3 text-sm">
                <span className="text-awaiting">○</span>
                <span className="font-medium">{g.label}</span>
                <span className="ml-auto text-xs font-medium text-awaiting">not referenced</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Attached files — real uploads (Slice 1). Stored, not yet read. */}
      <Suspense fallback={<div className="h-16 animate-pulse rounded-lg border border-border bg-surface" />}>
        <AttachedFilesSection matter={matter} />
      </Suspense>

      {/* Gaps — each carries its workflow consequence: what it blocks. */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Outstanding <span className="text-muted font-normal text-base">({r.gaps.length})</span>
        </h2>
        {r.gaps.length === 0 ? (
          <p className="rounded-lg border border-accent bg-surface px-4 py-3 text-sm text-accent">
            Every required fact and document is present — this matter is ready.
          </p>
        ) : (
          <ul className="rounded-lg border border-border bg-surface divide-y divide-border">
            {r.gaps.map((g) => (
              <li key={g.key} className="px-4 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="rounded border border-awaiting/50 px-1.5 py-0.5 text-[10px] uppercase text-awaiting">
                    {g.kind}
                  </span>
                  <span className="font-medium">{g.label}</span>
                  <span className="ml-auto text-xs font-medium text-awaiting">outstanding</span>
                </div>
                <p className="mt-1 text-sm text-foreground/70">{gapConsequence(r.rubricName, g.kind)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Activity trail — deferred, lowest priority */}
      <Suspense fallback={null}>
        <ActivitySection matterId={matter.id} timezone={timezone} />
      </Suspense>
    </div>
  );
}

async function ActivitySection({ matterId, timezone }: { matterId: string; timezone: string | null }) {
  const t = Date.now();
  const events = await listEvents(matterId);
  console.log(`[matter-timing] listEvents ms=${Date.now() - t}`);
  if (events.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">Activity</h2>
      <ol className="relative space-y-4 border-l border-border pl-5">
        {events.map((e) => (
          <li key={e.id} className="relative">
            <span className="absolute -left-[1.42rem] top-1.5 h-2 w-2 rounded-full bg-accent" />
            <div className="text-sm">{e.detail ?? e.type}</div>
            <div className="text-xs text-muted tabular-nums">
              {formatInstant(e.createdAt, timezone)}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function SectionSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-3">
      <div className="h-5 w-40 animate-pulse rounded bg-border" aria-label={label} />
      <div className="h-24 w-full animate-pulse rounded-lg border border-border bg-surface" />
    </div>
  );
}

// --- Page: only account + matter block the first paint ----------------------

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MON[m - 1]} ${y}`;
}

/**
 * P3 — the migration key-dates strip. Validity windows + lodgement target, filled only
 * from cited spans (empty = "—", never guessed). Stale-before-lodge in red; an
 * unresolved two-source conflict flagged, not silently overwritten. No settlement copy.
 */
/** Short person+item label for a date slot, e.g. "Hua medical". */
function slotLabel(profile: MigrationProfile, personId: string, itemKey: string): string {
  const SHORT: Record<string, string> = { passport_expiry: "passport", police_cert_validity: "NZPC", emedical_validity: "medical" };
  const first = (full: string) => full.trim().split(/\s+/)[0] || full;
  let who = "";
  if (personId !== "matter") {
    const a = profile.applicants.find((x) => x.id === personId);
    who = a ? first(a.fullName) : profile.sponsor?.id === personId ? first(profile.sponsor.fullName) : "";
  }
  return `${who} ${SHORT[itemKey] ?? itemKey.replace(/_/g, " ")}`.trim();
}

/**
 * The key-dates board — NOT a ticker. Empty slots are noise, so it shows only the
 * three chips that carry a fact: the lodgement target, any validity that dies before
 * it (stale), and any date with two sourced values (conflict, expandable to both).
 */
function MigrationDatesStrip({ profile, submission }: { profile: MigrationProfile; submission: string }) {
  const book = getBook(profile.stream);
  if (!book) return null;
  const slots = fillDatesFromText(buildMigrationGaps(book, profile, submission).dateSlots, submission, profile);
  const stale = staleSlotKeys(slots);
  const lodge = slots.find((s) => s.itemKey === "lodgement_target");
  const lodgeSt = lodge ? slotStatus(lodge) : { state: "empty" as const };
  const lodgeIso = lodgeSt.state === "set" ? lodgeSt.value : null;

  const staleChips: { label: string; value: string }[] = [];
  const conflictChips: { label: string; candidates: { value: string; source: string }[] }[] = [];
  for (const s of slots) {
    if (s.itemKey === "lodgement_target") continue;
    const st = slotStatus(s);
    if (st.state === "conflict") conflictChips.push({ label: slotLabel(profile, s.personId, s.itemKey), candidates: st.candidates });
    else if (st.state === "set" && stale.has(s.key)) staleChips.push({ label: slotLabel(profile, s.personId, s.itemKey), value: st.value });
  }

  if (!lodgeIso && staleChips.length === 0 && conflictChips.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-raise p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Key dates</div>
      <div className="flex flex-wrap items-start gap-2 text-sm">
        {lodgeIso ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Lodge</span>
            <span className="font-medium tabular-nums">{fmtISO(lodgeIso)}</span>
          </span>
        ) : null}
        {staleChips.map((c, i) => (
          <span key={`s${i}`} className="inline-flex items-center gap-1.5 rounded-lg border border-error/40 bg-error/10 px-2.5 py-1 text-error">
            <span className="text-[10px] font-semibold uppercase tracking-wide">Stale</span>
            <span className="font-medium">{c.label} {fmtISO(c.value)} — dies before lodge</span>
          </span>
        ))}
        {conflictChips.map((c, i) => (
          <details key={`c${i}`} className="group rounded-lg border border-awaiting/50 bg-awaiting-soft px-2.5 py-1 text-awaiting">
            <summary className="flex cursor-pointer list-none items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide">Conflict</span>
              <span className="font-medium">{c.label} — two dates, pick one</span>
              <span aria-hidden="true" className="text-xs">▸</span>
            </summary>
            <ul className="mt-1.5 space-y-1 border-t border-awaiting/30 pt-1.5 text-xs text-foreground/85">
              {c.candidates.map((cand, j) => (
                <li key={j}>
                  <span className="font-medium tabular-nums">{fmtISO(cand.value)}</span>
                  <span className="text-muted"> — “{cand.source}”</span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </div>
  );
}

/**
 * P4 — the consultation packet card. Derived from the matter (source-locked), review-
 * gated for export. Shows the section summary + held-back count + cover line; the full
 * artefact is the .docx. Approve → export; new material since approval → stale.
 */
function MigrationPacketCard({ matter, profile, attached }: { matter: Matter; profile: MigrationProfile; attached: Set<string> }) {
  const sub = matter.submission ?? "";
  const book = getBook(profile.stream);
  if (!book) return null;
  const ex = extractMigration(sub);
  const { gaps, dateSlots } = buildMigrationGaps(book, profile, sub, attached);
  const keyDates = datesStrip(profile, fillDatesFromText(dateSlots, sub, profile));
  const approved = !!matter.approvedAt;
  const stale = !!(approved && matter.updatedAt && matter.updatedAt > matter.approvedAt!);
  const packet = buildConsultationPacket({
    title: migrationMatterTitle(profile), profile, book, facts: ex.facts, gaps, keyDates,
    consultDate: matter.consultationAt ?? null, version: 1, generated: new Date().toISOString().slice(0, 10),
    approved: approved && !stale,
  });
  const state = stale ? "stale — re-approve" : approved ? "approved" : "draft — not sent";
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Consultation packet</div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${stale ? "bg-awaiting-soft text-awaiting" : approved ? "bg-accent-soft text-accent" : "bg-inset text-muted"}`}>{state}</span>
      </div>
      <p className="mt-1 text-xs text-muted">Every listed fact is sourced.</p>
      {/* The outstanding-by-person list is the People tiles above — not repeated here.
          The packet's own contribution is the agenda: what only a human can settle. */}
      <div className="mt-3 space-y-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Ask in the room</div>
        {packet.askInRoom.length ? (
          <ul className="space-y-0.5 text-sm text-foreground/80">
            {packet.askInRoom.map((a, i) => <li key={i}>· {a}</li>)}
          </ul>
        ) : (
          <p className="text-sm text-foreground/70">Nothing needs the adviser&apos;s judgment yet.</p>
        )}
        {packet.heldBackCount > 0 ? (
          <p className="pt-1 text-xs text-muted">{packet.heldBackCount} item(s) held back (no source) — not exported.</p>
        ) : null}
      </div>
      <div className="mt-3 border-t border-border pt-3">
        <PacketControls matterId={matter.id} approved={approved} stale={stale} />
      </div>
    </section>
  );
}

function partyHeading(p: Party): string {
  if (p.kind === "sponsor") return "Sponsor · NZ partner";
  if (p.kind === "employer") return "Employer";
  if (p.kind === "matter") return "File-level";
  return `Applicant · ${p.sub}`;
}

/**
 * Migration path (P1): the matter as a family of parties. Sections run applicants →
 * sponsor → employer → Unassigned. The Unassigned bucket is deliberately VISIBLE — an
 * item Briefly could not confidently place stays here rather than being guessed onto the
 * principal. Each party shows only its own outstanding items (never flattened).
 */
function MigrationPeopleSection({ profile, gaps }: { profile: MigrationProfile; gaps: Gap[] }) {
  const groups = groupByPerson(profile, gaps);
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Applicants &amp; parties</div>
      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map((g) => {
          const unassigned = !g.party;
          const applicant = g.party?.kind === "applicant" ? profile.applicants.find((a) => a.id === g.party!.id) : null;
          return (
            <div
              key={g.party?.id ?? "unassigned"}
              className={`rounded-xl border p-4 ${unassigned ? "border-awaiting/50 bg-awaiting-soft/40" : "border-border bg-raise"}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-foreground">{unassigned ? "Unassigned" : g.party!.name}</span>
                <span className="text-[11px] uppercase tracking-wide text-muted">{unassigned ? "not yet linked to a person" : partyHeading(g.party!)}</span>
              </div>
              {applicant ? (
                <div className="mt-0.5 text-xs text-muted">
                  {[applicant.location !== "unknown" ? applicant.location : null, applicant.nationality, applicant.passportExpiry ? `passport exp ${applicant.passportExpiry}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              ) : null}
              {g.items.length ? (
                <ul className="mt-2 space-y-1 text-sm text-foreground/85">
                  {g.items.map((gap, i) => (
                    <li key={i}>· {gap.label}</li>
                  ))}
                </ul>
              ) : (
                <div className="mt-2 text-sm text-muted">Nothing outstanding.</div>
              )}
              {unassigned ? (
                <div className="mt-2 text-[11px] text-awaiting">Assign to a person before relying on readiness — Briefly won&apos;t guess.</div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default async function MatterPage({ params }: { params: Promise<{ id: string }> }) {
  const t0 = Date.now();
  const { id } = await params;
  // Resolve the account (auth waterfall) and the matter row IN PARALLEL — the
  // matter query no longer waits on the auth chain. Tenant isolation is verified
  // immediately after (accountId must match), so an unowned id is not-found.
  const [account, matter] = await Promise.all([requireAccount(), getMatterById(id)]);
  console.log(`[matter-timing] essential (account+matter, parallel) ms=${Date.now() - t0}`);
  if (!matter || !matter.result || matter.accountId !== account.id) notFound();

  const r = matter.result;
  const isMig = isMigrationMatter(r);
  const migration = r.migration ?? null;

  // Migration documents → attached set → live gaps (attached items drop from Outstanding).
  const migDocs = isMig && migration ? await listDocuments(matter.id) : [];
  const attached = new Set(migDocs.filter((d) => d.personId && d.itemKey).map((d) => `${d.itemKey}:${d.personId}`));
  const migBook = isMig && migration ? getBook(migration.stream) : null;
  const liveGaps = migBook && migration ? buildMigrationGaps(migBook, migration, matter.submission ?? "", attached).gaps : r.gaps;
  const partyOpts = migration
    ? [
        ...migration.applicants.map((a) => ({ id: a.id, label: `${a.fullName} · ${a.role}` })),
        ...(migration.sponsor ? [{ id: migration.sponsor.id, label: `${migration.sponsor.fullName} · sponsor` }] : []),
        ...(migration.employer ? [{ id: migration.employer.id, label: `${migration.employer.legalName} · employer` }] : []),
      ]
    : [];
  const itemOpts = migBook
    ? [...new Map(migBook.items.filter((i) => i.type === "document_present").map((i) => [i.key, { key: i.key, label: i.label }])).values()]
    : [];
  const migBaseline = isMig && migration ? await getBaselineReview(matter.id) : null;
  const since = migBaseline && migration ? migrationSinceReview(migBaseline.snapshot.gaps, liveGaps, migration) : null;

  // A matter always opens on Next step — where the immediate decision and the
  // prepared client communication live. The Consultation plan is a secondary tab,
  // reached only by explicit choice (never by an automatic default or scroll).
  const defaultTab = "next";

  const tabs = [
    {
      id: "next",
      label: "Next step",
      node: (
        <Suspense fallback={<SectionSkeleton label="Preparing next step" />}>
          <NextStepSection matter={matter} account={account} />
        </Suspense>
      ),
    },
    // Migration files live in a tab, not a chapter between packet and chase.
    ...(isMig && migration
      ? [
          {
            id: "files",
            label: "Files",
            node: (
              <MigrationDocuments
                matterId={matter.id}
                parties={partyOpts}
                items={itemOpts}
                docs={migDocs.map((d) => ({ id: d.id, fileName: d.fileName, personId: d.personId, itemKey: d.itemKey, sensitive: d.sensitive }))}
              />
            ),
          },
        ]
      : []),
    {
      id: "conversation",
      label: "Conversation",
      node: (
        <Suspense fallback={<SectionSkeleton label="Loading the conversation" />}>
          <ConversationSection matter={matter} account={account} />
        </Suspense>
      ),
    },
    // Consultation plan is the conveyancing appraisal flow; on migration the packet
    // card is the consult artifact, so the tab is not shown.
    ...(isMig
      ? []
      : [
          {
            id: "plan",
            label: "Consultation plan",
            node: (
              <Suspense fallback={<SectionSkeleton label="Preparing consultation plan" />}>
                <ConsultationPlanSection matter={matter} />
              </Suspense>
            ),
          },
        ]),
  ];

  return (
    <div className="space-y-6">
      <Link href="/app/matters" className="text-sm text-muted hover:text-foreground">
        ← Matters
      </Link>

      {/* Since the last review — deferred, shows only when there's a baseline + changes */}
      <Suspense fallback={null}>
        <SinceReviewSection matter={matter} accountId={account.id} />
      </Suspense>

      {/* Identity header — name + quiet metadata. The one current STATE lives in the
          Now hero below, so it isn't competing with badges up here. */}
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-2xl font-medium tracking-tight">
            {isMig && migration ? migrationMatterTitle(migration) : (r.clientName ?? "Unnamed client")}
          </h1>
          {isMig ? null : (
            <span className="text-sm text-muted">{`${r.rubricName} · ${r.vertical}`}</span>
          )}
          {matter.sample ? (
            <span className="rounded-full bg-inset px-2 py-0.5 text-[11px] font-medium text-muted">Sample</span>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            {matter.sample ? (
              <form action={deleteSampleMatter}>
                <input type="hidden" name="id" value={matter.id} />
                <button type="submit" className="btn-control rounded-md px-3 py-1.5 text-sm text-muted hover:text-error">
                  Delete sample
                </button>
              </form>
            ) : null}
            <OpenEvidenceButton />
            <form action={markMatterReviewed}>
              <input type="hidden" name="id" value={matter.id} />
              <button
                type="submit"
                title="Snapshot the matter as it stands, so Briefly can show what changes next"
                className="btn-control rounded-md px-3 py-1.5 text-sm"
              >
                Mark reviewed
              </button>
            </form>
            <Suspense fallback={<div className="h-8 w-28 animate-pulse rounded-md bg-inset" />}>
              <AssignSection matter={matter} />
            </Suspense>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          <span>{evidenceLabel(r.fields)}</span>
          {r.clientEmail ? <span>{r.clientEmail}</span> : null}
        </div>
      </header>

      {/* Migration path: visible routing (P5c) → key dates strip (P3) + the family of parties. */}
      {r.migrationRouting ? (
        <MigrationRoutingBanner
          matterId={matter.id}
          status={r.migrationRouting.status}
          streamDetail={r.migrationRouting.streamDetail}
          cue={r.migrationRouting.cue}
          reason={r.migrationRouting.reason}
          confirmed={r.migrationRouting.confirmed}
        />
      ) : null}
      {isMig && migration ? <MigrationDatesStrip profile={migration} submission={matter.submission} /> : null}
      {isMig && since && since.resolved.length ? (
        <div className="rounded-xl border border-accent/30 bg-accent-soft/30 p-3 text-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Since your last review</div>
          <ul className="mt-1 space-y-0.5 text-accent">
            {since.resolved.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
          {since.stillMissing.length ? <div className="mt-1 text-xs text-muted">{since.stillMissing.length} still missing</div> : null}
        </div>
      ) : null}
      {isMig && migration ? <MigrationPeopleSection profile={migration} gaps={liveGaps} /> : null}
      {isMig && migration ? <MigrationPacketCard matter={matter} profile={migration} attached={attached} /> : null}

      {/* Critical dates (settlement/finance) — a property-path noun; hidden on migration
          matters (their validity-window dates arrive in P3). */}
      {!isMig ? (
        <Suspense fallback={null}>
          <CriticalDatesSection matter={matter} />
        </Suspense>
      ) : null}

      {/* Returning client — deferred */}
      <Suspense fallback={null}>
        <ReturningClientSection matter={matter} />
      </Suspense>

      {/* The "Now" — the matter's centre of gravity, above the tabs. Migration reads as
          a FILE (banner · dates · people · packet · chase), so the decision-now hero —
          which duplicated the chase — is not shown on that path. */}
      {!isMig ? (
        <Suspense
          fallback={<div className="h-40 w-full animate-pulse rounded-xl border border-border bg-surface" />}
        >
          <OverviewSection matter={matter} account={account} />
        </Suspense>
      ) : null}

      {/* Two working views; the evidence is pulled forward on demand, not a tab. */}
      <MatterTabs tabs={tabs} defaultTab={defaultTab} />

      {/* The matter record — pulled forward as a Liquid Glass evidence drawer. */}
      <EvidenceDrawer>
        <Suspense fallback={<div className="px-1 py-2 text-sm text-muted">Loading the record…</div>}>
          <RecordPanel matter={matter} timezone={account.timezone} />
        </Suspense>
      </EvidenceDrawer>
    </div>
  );
}
