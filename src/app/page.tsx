import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { PLANS, CREDIT_PACK } from "@/lib/plans";
import { WaitlistForm } from "@/app/waitlist-form";
import { joinWaitlist } from "@/app/waitlist-actions";
import {
  Reveal,
  PreparedDesk,
  ExploreIntake,
  TwoPathTriage,
  SummaryVsWorkflow,
  RubricWorkspace,
} from "@/app/landing";
import { ThemeToggle } from "@/app/theme-toggle";

const PRICING = [PLANS.solo, PLANS.practice, PLANS.firm];

function Nav() {
  return (
    <header className="glass-nav sticky top-0 z-50">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="font-serif text-xl font-semibold tracking-tight">
          Briefly
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted sm:flex">
          <a href="#how" className="hover:text-foreground">How it works</a>
          <a href="#pricing" className="hover:text-foreground">Pricing</a>
          <Link href="/login" className="hover:text-foreground">Sign in</Link>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/login"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}

function Section({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-6xl scroll-mt-24 space-y-10 px-6 py-20 lg:py-28">
      {children}
    </section>
  );
}

function Heading({ title, sub }: { title: string; sub?: string }) {
  return (
    <Reveal className="mx-auto max-w-2xl space-y-3 text-center">
      <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {sub ? <p className="text-muted">{sub}</p> : null}
    </Reveal>
  );
}

export default async function Landing() {
  const user = await getAuthUser();
  if (user) redirect("/app");

  return (
    <div className="min-h-screen">
      <Nav />

      <main>
        {/* ── Hero: arrive to a prepared desk ───────────────────────────── */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -top-24 right-[6%] h-[420px] w-[420px] rounded-full bg-accent/10 blur-3xl" />
            <div className="absolute top-48 left-[2%] h-[320px] w-[320px] rounded-full bg-awaiting/10 blur-3xl" />
          </div>

          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-6 pb-20 pt-16 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:gap-12 lg:pb-28 lg:pt-24">
            <div className="anim-rise">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Prepared before you open it
              </div>
              <h1 className="mt-6 font-serif text-5xl font-semibold leading-[1.02] tracking-tight text-balance sm:text-6xl lg:text-7xl">
                Work arrives ready.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
                While you were away, Briefly turned a night of client email into short, prepared
                matters — checked against how <em>your</em> firm works.
              </p>
              <p className="mt-3 max-w-xl text-lg leading-relaxed text-muted">
                It <strong className="font-medium text-foreground">reads the documents</strong>,
                follows the conversation, and prepares the next move — so you open work that&apos;s
                ready to review, not an inbox.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  href="/login"
                  className="rounded-lg bg-accent px-6 py-3 text-sm font-medium text-accent-fg shadow-sm transition-opacity hover:opacity-90"
                >
                  Start free
                </Link>
                <ExploreIntake variant="button" />
              </div>
              <p className="mt-8 max-w-md text-sm leading-relaxed text-muted">
                One matter is one new client intake. Every follow-up and reply threads back into the
                same matter — never a new one.
              </p>
            </div>

            <PreparedDesk />
          </div>
        </section>

        {/* ── The core mechanic: two-path triage ────────────────────────── */}
        <Section id="triage">
          <TwoPathTriage />
        </Section>

        {/* ── Flagship: it reads the documents (page-cited, confirmation-gated) ─ */}
        <Section id="reads">
          <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-14">
            <Reveal className="space-y-4 lg:pt-6">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Reads the source, not just the text
              </div>
              <h2 className="font-serif text-3xl font-semibold leading-[1.08] tracking-tight text-balance sm:text-4xl">
                It reads the documents, not just the email.
              </h2>
              <p className="max-w-xl text-muted">
                When a client attaches a contract, a rates notice, an ID — Briefly opens the file and
                pulls the facts that matter, each one <strong className="font-medium text-foreground">traceable
                to the page it came from</strong>. Nothing is added to the matter until you confirm it.
              </p>
              <div className="rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm">
                <span className="font-medium text-accent">A client replies with the signed contract?</span>{" "}
                <span className="text-foreground/80">Briefly reads it the moment it lands.</span>
              </div>
              <ul className="space-y-1.5 pt-1 text-sm text-muted">
                {[
                  "Every fact carries its page — verify it against the source in one click.",
                  "Scanned or photographed? It reads those too, and flags what it can't verify.",
                  "Findings wait as evidence; you confirm what goes on the matter.",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <span aria-hidden="true" className="mt-0.5 shrink-0 font-semibold text-accent">✓</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal className="grid gap-4 sm:grid-cols-[0.9fr_1.1fr] sm:items-start">
              {/* The source document */}
              <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-sm)]">
                <div className="border-b border-border bg-inset px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-muted">
                  Contract of Sale · PDF · p.1
                </div>
                <div className="space-y-2 p-4">
                  <div className="text-center font-serif text-[11px] font-semibold">
                    CONTRACT OF SALE OF REAL ESTATE
                  </div>
                  <div className="h-1.5 w-full rounded bg-border/70" />
                  <div className="h-1.5 w-4/5 rounded bg-border/70" />
                  {[
                    "Vendor: Rafael & Marisol Delgado",
                    "Purchase Price: $980,000",
                    "Settlement Date: 5 June 2027",
                  ].map((line) => (
                    <div key={line} className="rounded bg-accent-soft px-1.5 py-1 text-[10.5px] font-medium text-foreground/85">
                      {line}
                    </div>
                  ))}
                  <div className="h-1.5 w-3/4 rounded bg-border/70" />
                  <div className="h-1.5 w-2/3 rounded bg-border/70" />
                </div>
              </div>

              {/* The extracted, page-cited evidence */}
              <div className="overflow-hidden rounded-xl border border-accent/40 bg-surface">
                <div className="border-b border-border bg-inset px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                  Document evidence — awaiting your confirmation
                </div>
                <ul className="divide-y divide-border">
                  {[
                    { label: "Vendor name", value: "Rafael & Marisol Delgado" },
                    { label: "Purchase price", value: "$980,000" },
                    { label: "Settlement date", value: "5 June 2027" },
                  ].map((f) => (
                    <li key={f.label} className="space-y-1.5 px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted">{f.label}</div>
                        <span className="shrink-0 rounded-full bg-inset px-2 py-0.5 text-[10px] font-medium text-muted">
                          ▤ p.1
                        </span>
                      </div>
                      <div className="text-sm font-medium">{f.value}</div>
                      <div className="flex items-center gap-2 pt-0.5">
                        <span className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-fg">
                          Confirm
                        </span>
                        <span className="text-[10px] text-muted">Reject</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </Section>

        {/* ── How it connects: the truthful plumbing ────────────────────── */}
        <Section id="connect">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <Reveal className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                How it connects
              </div>
              <h2 className="font-serif text-3xl font-semibold leading-[1.08] tracking-tight text-balance sm:text-4xl">
                No inbox access. Just an address.
              </h2>
              <p className="max-w-xl text-muted">
                Briefly gives your firm a private intake address. Forward client enquiries to it — or
                point your website enquiry form or shared inbox at it — and each one becomes a
                prepared matter. Briefly only ever sees what&apos;s sent to that address, never the
                rest of your inbox.
              </p>
              <p className="text-sm text-muted">
                Replies thread straight back to the same matter, so the whole conversation stays in
                one place.
              </p>
            </Reveal>

            <Reveal>
              <div className="glass glass-sheen rounded-3xl p-6 sm:p-8">
                <ol className="space-y-3">
                  {[
                    { k: "1", t: "A client emails you", d: "Or your website form / shared inbox forwards it on." },
                    { k: "2", t: "yourfirm@inbound.brieflyhub.app", d: "Your private Briefly intake address.", mono: true },
                    { k: "3", t: "A prepared matter", d: "Classified, extracted, and checked — waiting for your review." },
                  ].map((s, i) => (
                    <li key={s.k}>
                      <div className="flex items-start gap-3">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                          {s.k}
                        </span>
                        <div className="min-w-0">
                          <div className={`text-sm font-medium ${s.mono ? "break-all font-mono text-accent" : ""}`}>
                            {s.t}
                          </div>
                          <div className="text-xs text-muted">{s.d}</div>
                        </div>
                      </div>
                      {i < 2 ? <div className="ml-3.5 h-4 w-px bg-border" /> : null}
                    </li>
                  ))}
                </ol>
              </div>
            </Reveal>
          </div>
        </Section>

        {/* ── The differentiation: a summary is not a workflow ──────────── */}
        <Section>
          <Reveal className="mx-auto max-w-3xl space-y-4 text-center">
            <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              A summary is not a workflow
            </div>
            <h2 className="font-serif text-3xl font-semibold leading-[1.08] tracking-tight text-balance sm:text-4xl lg:text-5xl">
              A summary tells you what it read.{" "}
              <span className="italic text-accent">Briefly prepares what happens next.</span>
            </h2>
          </Reveal>
          <Reveal>
            <SummaryVsWorkflow />
          </Reveal>

          {/* The prepared artifact, made tangible — its three real parts. */}
          <Reveal className="mt-12 grid gap-4 sm:grid-cols-3">
            {[
              {
                t: "Briefly noticed",
                d: "The facts it connected — each tied to a client quote or the document page it came from.",
              },
              {
                t: "Decision now",
                d: "What this matter needs from you, and whether it's ready, still incomplete, or blocked.",
              },
              {
                t: "Prepared response",
                d: "A client-facing draft, grounded in the matter — yours to edit, approve, and send.",
              },
            ].map((c, i) => (
              <div key={c.t} className="rounded-2xl border border-border bg-surface p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                  {i === 0 ? "Understand" : i === 1 ? "Decide" : "Act"}
                </div>
                <h3 className="mt-2 font-serif text-lg font-semibold tracking-tight">{c.t}</h3>
                <p className="mt-1.5 text-sm text-muted">{c.d}</p>
              </div>
            ))}
          </Reveal>
        </Section>

        {/* ── The fit: one living rubric workspace (the interactive "how") ─ */}
        <Section id="how">
          <Heading
            title="Teach Briefly how your business works."
            sub="Pick your business line and watch a real enquiry become a prepared file — the same engine following a different rulebook, right down to the deliverable it drafts."
          />
          <Reveal>
            <RubricWorkspace />
          </Reveal>
          <p className="text-center text-base font-medium">
            Same engine. Different rulebook. <span className="text-accent">No code.</span>
          </p>
          <Reveal className="mx-auto max-w-2xl space-y-4 text-center">
            <p className="text-sm text-muted">
              Purpose-built for legal, property, and accounting — and, because it follows your own
              rules, at home in any practice that works from client intake.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {["Migration", "Insurance", "Recruitment", "Consulting", "Wealth advisory", "Veterinary"].map(
                (x) => (
                  <span
                    key={x}
                    className="rounded-full border border-border px-3 py-1 text-xs text-muted"
                  >
                    {x}
                  </span>
                ),
              )}
            </div>
          </Reveal>
        </Section>

        {/* ── Thread stays together ─────────────────────────────────────── */}
        {/* ── Flagship: the conversation, worked in one place ───────────── */}
        <Section id="conversation">
          <Heading
            title="The whole conversation, in one place."
            sub="Read the back-and-forth, see what's still outstanding, and reply without leaving the matter. Briefly drafts from the conversation and what's missing; you edit and send — one email thread, both ways."
          />
          <Reveal className="mx-auto max-w-2xl">
            <div className="glass glass-sheen space-y-4 rounded-3xl p-5 sm:p-7">
              {/* client → */}
              <div className="flex justify-start">
                <div className="max-w-[82%] space-y-1">
                  <div className="px-1 text-[11px] text-muted">Tomas · client</div>
                  <div className="rounded-2xl rounded-bl-md border border-border bg-surface px-3.5 py-2.5 text-sm">
                    Done — I&apos;ve signed the Contract of Sale and attached it here.
                    <span className="mt-2 flex w-fit items-center gap-1 rounded-md border border-border bg-surface/70 px-2 py-1 text-[11px] font-medium text-foreground/80">
                      📎 Contract-of-Sale.pdf
                    </span>
                  </div>
                </div>
              </div>
              {/* you → */}
              <div className="flex justify-end">
                <div className="max-w-[82%] space-y-1">
                  <div className="px-1 text-right text-[11px] text-muted">You</div>
                  <div className="rounded-2xl rounded-br-md bg-accent-soft px-3.5 py-2.5 text-sm text-foreground">
                    Perfect — that&apos;s everything we need. We&apos;ll review the contract and begin
                    the searches, then confirm your settlement.
                  </div>
                </div>
              </div>
              {/* composer */}
              <div className="overflow-hidden rounded-xl border border-border bg-surface">
                <div className="px-3.5 py-3 text-sm text-muted">Reply to Tomas…</div>
                <div className="flex items-center justify-between gap-3 border-t border-border bg-inset px-3 py-2">
                  <span className="text-xs font-medium text-accent">✦ Draft with Briefly</span>
                  <span className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-fg">Send</span>
                </div>
              </div>
              <p className="text-center text-[11px] text-muted">
                Every reply threads into the same client conversation — never a new one. Nothing sends
                until you approve.
              </p>
            </div>
          </Reveal>
        </Section>

        {/* ── It keeps the work moving: reminders · team · gate ─────────── */}
        <Section>
          <Heading
            title="It keeps the work moving."
            sub="Preparing the first draft is only the start. Briefly follows through — and holds the line at your approval."
          />
          <Reveal className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                t: "Follow-ups, ready to send",
                d: "When a client goes quiet, Briefly notices, drafts the follow-up, and flags it for you — you review and send. Nothing goes out on its own.",
                icon: (
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
                ),
              },
              {
                t: "Prepared for the meeting",
                d: "Set a consultation date and Briefly compiles the pre-meeting packet — the facts, the open questions, and an agenda — so you walk in ready.",
                icon: (
                  <>
                    <path d="M8 2v4M16 2v4M3 10h18" />
                    <path d="M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
                  </>
                ),
              },
              {
                t: "Since your last review",
                d: "Come back to exactly what changed — new facts, documents received, replies folded in — each one sourced, so nothing slips past you.",
                icon: (
                  <>
                    <path d="M3 3v5h5" />
                    <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
                    <path d="M12 8v4l3 2" />
                  </>
                ),
              },
              {
                t: "Remembers your clients",
                d: "A returning client's known facts carry forward across their matters — so you're never re-asking for what they already told you.",
                icon: (
                  <>
                    <path d="M20 21a8 8 0 0 0-16 0" />
                    <circle cx="12" cy="7" r="4" />
                  </>
                ),
              },
              {
                t: "Shared across your firm",
                d: "Assign matters and hand them over as work moves. Managers see the whole firm; each person gets their own focused list.",
                icon: (
                  <>
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" />
                  </>
                ),
              },
              {
                t: "Always your call",
                d: "Nothing sends and no decision is made until you approve. Briefly prepares the work; the professional owns the decision and the send.",
                icon: <path d="M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7l7-4Z" />,
              },
            ].map((c) => (
              <div key={c.t} className="rounded-2xl border border-border bg-surface p-6">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {c.icon}
                  </svg>
                </div>
                <h3 className="mt-4 font-serif text-lg font-semibold tracking-tight">{c.t}</h3>
                <p className="mt-1.5 text-sm text-muted">{c.d}</p>
              </div>
            ))}
          </Reveal>
        </Section>

        {/* ── The decision: pricing ─────────────────────────────────────── */}
        <Section id="pricing">
          <Heading
            title="Simple, metered pricing"
            sub="Every plan includes a set number of matters each month. A matter is one new client intake — replies and follow-ups are included. Credit packs cover overage; no surprise bills."
          />
          <Reveal className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-3">
            {PRICING.map((plan) => {
              const featured = plan.id === "practice";
              return (
                <div
                  key={plan.id}
                  className={`flex flex-col gap-4 rounded-2xl border bg-surface p-5 transition-shadow hover:shadow-sm ${
                    featured ? "border-accent shadow-sm" : "border-border"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{plan.name}</span>
                      {featured ? (
                        <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-fg">
                          Popular
                        </span>
                      ) : null}
                    </div>
                    <div className="text-2xl font-semibold tabular-nums tracking-tight">
                      {plan.priceLabel}
                    </div>
                  </div>
                  <div className="text-sm text-muted">
                    <span className="font-medium tabular-nums text-foreground">
                      {plan.monthlyMatters.toLocaleString()}
                    </span>{" "}
                    matters / month
                  </div>
                  <Link
                    href="/login"
                    className={`mt-auto rounded-lg px-4 py-2 text-center text-sm font-medium ${
                      featured
                        ? "bg-accent text-accent-fg hover:opacity-90"
                        : "border border-border hover:bg-inset"
                    }`}
                  >
                    Start free
                  </Link>
                </div>
              );
            })}
          </Reveal>
          <p className="text-center text-xs text-muted">
            Every plan starts with a 7-day free trial — no charge until it ends. Overage is sold as
            credit packs ({CREDIT_PACK.priceLabel} for {CREDIT_PACK.credits}). Prices may change
            before general availability.
          </p>
        </Section>

        {/* ── Waitlist ──────────────────────────────────────────────────── */}
        <Section id="waitlist">
          <Reveal className="mx-auto max-w-4xl space-y-4 rounded-3xl border border-border bg-surface p-8 text-center sm:p-12">
            <h2 className="text-3xl font-semibold tracking-tight text-balance">
              Don&apos;t have an invite yet?
            </h2>
            <p className="mx-auto max-w-xl text-muted">
              Briefly is invite-only during early access. Leave your email and we&apos;ll reach out
              as spots open up.
            </p>
            <WaitlistForm action={joinWaitlist} />
          </Reveal>
        </Section>

        {/* ── Closing ───────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 pb-28 pt-4 text-center">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Arrive to work that&apos;s already prepared.
            </h2>
            <div className="mt-7 flex flex-wrap justify-center gap-4">
              <Link
                href="/login"
                className="rounded-lg bg-accent px-6 py-3 text-sm font-medium text-accent-fg shadow-sm transition-opacity hover:opacity-90"
              >
                Start free
              </Link>
              <ExploreIntake variant="button" />
            </div>
          </Reveal>
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted sm:flex-row">
          <div className="flex items-center gap-3">
            <span className="font-serif text-base font-semibold text-foreground">Briefly</span>
            <span className="hidden sm:inline">· Prepared before you open it</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <Link href="/login" className="hover:text-foreground">Sign in</Link>
          </div>
          <div>© {new Date().getFullYear()} Briefly</div>
        </div>
      </footer>
    </div>
  );
}
