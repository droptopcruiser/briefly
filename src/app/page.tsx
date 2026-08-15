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
  ThreadingProof,
} from "@/app/landing";
import { ThemeToggle } from "@/app/theme-toggle";

const PRICING = [PLANS.trial, PLANS.solo, PLANS.practice, PLANS.firm];

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
                While you were away, Briefly turned a night of client email into a short, prepared
                brief — classified, structured, and checked against how <em>your</em> firm works.
                You open reviewed matters, not an inbox.
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

        {/* ── The differentiation: a summary is not a workflow ──────────── */}
        <Section>
          <Reveal className="mx-auto max-w-3xl space-y-4 text-center">
            <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              A summary is not a workflow
            </div>
            <h2 className="font-serif text-3xl font-semibold leading-[1.08] tracking-tight text-balance sm:text-4xl lg:text-5xl">
              Other AI tells you what it read.{" "}
              <span className="italic text-accent">Briefly prepares what happens next.</span>
            </h2>
          </Reveal>
          <Reveal>
            <SummaryVsWorkflow />
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
        </Section>

        {/* ── Thread stays together ─────────────────────────────────────── */}
        <Section>
          <ThreadingProof />
        </Section>

        {/* ── The decision: pricing ─────────────────────────────────────── */}
        <Section id="pricing">
          <Heading
            title="Simple, metered pricing"
            sub="Every plan includes a set number of matters each month. A matter is one new client intake — replies and follow-ups are included. Credit packs cover overage; no surprise bills."
          />
          <Reveal className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PRICING.map((plan) => {
              const featured = plan.id === "solo";
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
            14-day free trial, no charge until it ends. Overage is sold as credit packs (
            {CREDIT_PACK.priceLabel} for {CREDIT_PACK.credits}). Prices may change before general
            availability.
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
