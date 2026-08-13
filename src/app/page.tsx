import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { PLANS, CREDIT_PACK } from "@/lib/plans";
import { WaitlistForm } from "@/app/waitlist-form";
import { joinWaitlist } from "@/app/waitlist-actions";

const VERTICALS = [
  { name: "Family Law", items: ["Marriage certificate", "Children", "Assets", "Separation date"] },
  { name: "Veterinary", items: ["Pet name", "Species", "Vaccination history", "Symptoms"] },
  { name: "Accounting", items: ["Tax year", "Business type", "Bank statements", "GST status"] },
];

const FLOW = [
  "A client emails you.",
  "Briefly recognises which of your workflows applies.",
  "Extracts everything that workflow requires.",
  "Shows you exactly what's missing.",
  "Drafts the follow-up for the missing items.",
  "You review and approve.",
];

const OPENS_TO = [
  { n: "7", label: "matters ready to review" },
  { n: "2", label: "waiting on documents" },
  { n: "4", label: "follow-ups drafted" },
];

const COMPARISON = [
  ["Generic AI", "Briefly"],
  ["One fixed prompt", "Your own intake types"],
  ["Generic extraction", "The fields you require"],
  ["A loose summary", "A readiness score, computed"],
  ["Unstructured text", "A structured, reviewed matter"],
  ["Invents missing context", "Every fact backed by a source quote"],
];

const OUTCOMES = [
  ["You never manually create another matter", "Every enquiry arrives already structured and classified."],
  ["Every matter starts complete", "Missing facts and documents are flagged before you open it."],
  ["Clients get faster, consistent replies", "The follow-up is drafted the moment the enquiry lands."],
];

const PRICING = [PLANS.trial, PLANS.solo, PLANS.practice, PLANS.firm];

// ── The floating product proof — a glass vessel over solid, readable panels ──
function HeroDashboard() {
  const rows: {
    name: string;
    type: string;
    status: string;
    tone: string;
    pct: number;
    bar: string;
  }[] = [
    { name: "Priya Sharma", type: "Spousal visa", status: "Ready", tone: "border-accent text-accent", pct: 100, bar: "bg-accent" },
    { name: "Daniel Okafor", type: "Divorce petition", status: "Missing details", tone: "border-awaiting text-awaiting", pct: 68, bar: "bg-awaiting" },
    { name: "Amara Nwosu", type: "Asylum claim", status: "Follow-up drafted", tone: "border-border text-muted", pct: 52, bar: "bg-awaiting" },
  ];
  const overnight = ["12 emails triaged", "3 matters built", "5 gaps flagged", "4 follow-ups drafted"];

  return (
    <div className="relative anim-float">
      {/* Incoming email → structured matter: a floating chip with a live trace
          that runs down the outside edge and points into the first matter row. */}
      <div className="pointer-events-none absolute -left-10 -top-11 z-20 hidden lg:block">
        <div className="glass flex w-max items-center gap-2 rounded-xl px-3 py-2 text-xs shadow-sm">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-accent-soft text-accent">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
          </span>
          <span className="font-medium text-foreground">New enquiry</span>
          <span className="text-muted">rebecca@…</span>
        </div>
        <svg width="70" height="170" viewBox="0 0 70 170" fill="none" className="ml-3">
          <path
            id="heroTrace"
            d="M6 4 C 6 70, 4 120, 52 150"
            stroke="var(--accent)"
            strokeWidth="1.5"
            strokeDasharray="3 6"
            strokeLinecap="round"
            opacity="0.45"
          />
          <circle r="3.5" fill="var(--accent)" className="trace-dot">
            <animateMotion dur="2.8s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
              <mpath href="#heroTrace" />
            </animateMotion>
          </circle>
        </svg>
      </div>

      {/* Glass vessel */}
      <div className="glass glass-sheen rounded-[28px] p-3 sm:p-4">
        {/* Header — greeting + the readiness count */}
        <div className="flex items-center justify-between px-2 pb-3 pt-1">
          <div>
            <div className="text-sm font-semibold text-foreground">Good morning, Rebecca</div>
            <div className="text-xs text-muted">Thursday, 14 August</div>
          </div>
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            3 ready for you
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1.7fr_1fr]">
          {/* Matter rows — solid, readable */}
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.name} className="px-3.5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {r.name} <span className="font-normal text-muted">· {r.type}</span>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${r.tone}`}>
                      {r.status}
                    </span>
                  </div>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-inset">
                    <div className={`h-full rounded-full ${r.bar}`} style={{ width: `${r.pct}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Prepared overnight — solid side panel */}
          <div className="rounded-2xl border border-border bg-surface p-3.5">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Prepared overnight
            </div>
            <ul className="mt-2.5 space-y-2">
              {overnight.map((o) => (
                <li key={o} className="flex items-center gap-2 text-xs text-foreground">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  {o}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

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
        <Link
          href="/login"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
        >
          Start free
        </Link>
      </div>
    </header>
  );
}

export default async function Landing() {
  const user = await getAuthUser();
  if (user) redirect("/app");

  return (
    <div className="min-h-screen">
      <Nav />

      <main>
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          {/* soft depth so the glass has something to refract */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -top-24 right-[6%] h-[420px] w-[420px] rounded-full bg-accent/10 blur-3xl" />
            <div className="absolute top-48 left-[2%] h-[320px] w-[320px] rounded-full bg-awaiting/10 blur-3xl" />
          </div>

          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-6 pb-20 pt-16 lg:grid-cols-[1fr_1.05fr] lg:gap-10 lg:pb-28 lg:pt-24">
            {/* Left — the editorial pitch */}
            <div className="anim-rise">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Prepared before you open it
              </div>
              <h1 className="mt-6 font-serif text-5xl font-semibold leading-[1.02] tracking-tight text-balance sm:text-6xl lg:text-7xl">
                Work arrives ready.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
                Briefly prepares each client enquiry before you get to it — classified, structured,
                and checked against how <em>your</em> firm works. You open reviewed matters, not an
                inbox.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-5">
                <Link
                  href="/login"
                  className="rounded-lg bg-accent px-6 py-3 text-sm font-medium text-accent-fg shadow-sm transition-opacity hover:opacity-90"
                >
                  Start free
                </Link>
                <a href="#how" className="text-sm font-medium text-foreground hover:text-accent">
                  See how it works →
                </a>
              </div>
              <p className="mt-8 max-w-md text-sm leading-relaxed text-muted">
                One matter is one new client intake. Every follow-up and reply threads back into the
                same matter — never a new one.
              </p>
            </div>

            {/* Right — the floating product proof */}
            <div className="lg:pl-4">
              <HeroDashboard />
            </div>
          </div>
        </section>

        {/* ── The moment ───────────────────────────────────────────────── */}
        <Section>
          <Heading
            title="You don't open an inbox. You open your work."
            sub="Overnight, Briefly did the preparation. This is what's waiting when you sit down."
          />
          <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2 sm:items-stretch">
            <div className="flex flex-col justify-center rounded-2xl border border-border bg-inset p-6">
              <div className="text-xs uppercase tracking-wide text-muted">Without Briefly</div>
              <div className="mt-3 text-4xl font-semibold tabular-nums text-muted">43</div>
              <div className="text-sm text-muted">unread emails to triage</div>
            </div>
            <div className="space-y-3 rounded-2xl border border-accent bg-surface p-6">
              <div className="text-xs uppercase tracking-wide text-accent">With Briefly</div>
              <ul className="space-y-2">
                {OPENS_TO.map((o) => (
                  <li key={o.label} className="flex items-baseline gap-3">
                    <span className="w-8 shrink-0 text-2xl font-semibold tabular-nums text-accent">
                      {o.n}
                    </span>
                    <span className="text-sm">{o.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        {/* ── The differentiator ───────────────────────────────────────── */}
        <Section>
          <div className="mx-auto max-w-2xl space-y-3 text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-balance">
              Teach Briefly how your business works.
            </h2>
            <p className="text-muted">
              Show it once — the facts you capture, the documents you require, what
              &ldquo;complete&rdquo; means for you. From then on, every client email follows your
              workflow automatically. Most AI makes you adapt to it. Briefly adapts to you.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 text-sm">
            {["Your required fields", "Your required documents", "What counts as complete"].map((t) => (
              <span key={t} className="rounded-full border border-border bg-surface px-3.5 py-1.5">
                {t}
              </span>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {VERTICALS.map((v) => (
              <div key={v.name} className="space-y-3 rounded-2xl border border-border bg-surface p-5">
                <div className="text-sm font-semibold">{v.name}</div>
                <ul className="space-y-1.5">
                  {v.items.map((it) => (
                    <li key={it} className="flex items-center gap-2 text-sm text-muted">
                      <span className="text-accent">✓</span>
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-center text-base font-medium">
            Same AI engine. Different intake. <span className="text-accent">No code.</span>
          </p>
        </Section>

        {/* ── The flow ─────────────────────────────────────────────────── */}
        <Section id="how">
          <Heading
            title="From inbox to reviewed matter"
            sub="The workflow does the work. You just approve the result."
          />
          <ol className="mx-auto max-w-2xl space-y-2">
            {FLOW.map((step, i) => (
              <li
                key={i}
                className="flex items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3.5"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-medium tabular-nums text-accent-fg">
                  {i + 1}
                </span>
                <span className="text-sm">{step}</span>
              </li>
            ))}
          </ol>
        </Section>

        {/* ── Comparison ───────────────────────────────────────────────── */}
        <Section>
          <h2 className="text-center text-3xl font-semibold tracking-tight text-balance">
            Most AI summarizes email. Briefly understands your business.
          </h2>
          <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-border">
            {COMPARISON.map(([a, b], i) => (
              <div
                key={i}
                className={`grid grid-cols-2 ${i === 0 ? "bg-surface font-medium" : "bg-inset"} ${
                  i > 0 ? "border-t border-border" : ""
                }`}
              >
                <div className={`px-4 py-3 text-sm ${i === 0 ? "" : "text-muted"}`}>{a}</div>
                <div
                  className={`border-l border-border px-4 py-3 text-sm ${
                    i === 0 ? "text-accent" : "font-medium"
                  }`}
                >
                  {b}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Outcomes ─────────────────────────────────────────────────── */}
        <Section>
          <div className="grid gap-4 sm:grid-cols-3">
            {OUTCOMES.map(([title, body]) => (
              <div key={title} className="space-y-2 rounded-2xl border border-border bg-surface p-5">
                <h3 className="font-medium text-balance">{title}</h3>
                <p className="text-sm leading-relaxed text-muted">{body}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Vision seed ──────────────────────────────────────────────── */}
        <Section>
          <div className="glass glass-sheen mx-auto max-w-4xl space-y-4 rounded-3xl p-8 text-center sm:p-12">
            <h2 className="text-3xl font-semibold tracking-tight text-balance">
              Email is where conversations begin.
              <br className="hidden sm:block" /> Briefly is where work begins.
            </h2>
            <p className="mx-auto max-w-xl text-muted">
              Today that work arrives by email. Tomorrow it&apos;s forms, voice, and messages too —
              all prepared the same way, in your workflow, before you get to it.
            </p>
          </div>
        </Section>

        {/* ── Pricing ──────────────────────────────────────────────────── */}
        <Section id="pricing">
          <Heading
            title="Simple, metered pricing"
            sub="Every plan includes a set number of matters each month, with credit packs for overage — no surprise bills."
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PRICING.map((plan) => {
              const featured = plan.id === "solo";
              return (
                <div
                  key={plan.id}
                  className={`flex flex-col gap-4 rounded-2xl border bg-surface p-5 ${
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
          </div>
          <p className="text-center text-xs text-muted">
            14-day free trial, no charge until it ends. Overage is sold as credit packs (
            {CREDIT_PACK.priceLabel} for {CREDIT_PACK.credits}). Prices may change before general
            availability.
          </p>
        </Section>

        {/* ── Waitlist ─────────────────────────────────────────────────── */}
        <Section id="waitlist">
          <div className="mx-auto max-w-4xl space-y-4 rounded-3xl border border-border bg-surface p-8 text-center sm:p-12">
            <h2 className="text-3xl font-semibold tracking-tight text-balance">
              Don&apos;t have an invite yet?
            </h2>
            <p className="mx-auto max-w-xl text-muted">
              Briefly is invite-only during early access. Leave your email and we&apos;ll reach out
              as spots open up.
            </p>
            <WaitlistForm action={joinWaitlist} />
          </div>
        </Section>

        {/* ── Closing ──────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 pb-28 pt-4 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Arrive to work that&apos;s already prepared.
          </h2>
          <div className="mt-7 flex justify-center">
            <Link
              href="/login"
              className="rounded-lg bg-accent px-6 py-3 text-sm font-medium text-accent-fg shadow-sm transition-opacity hover:opacity-90"
            >
              Start free
            </Link>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
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

// Consistent editorial rhythm: generous vertical space, centered measure.
function Section({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-6xl scroll-mt-24 space-y-8 px-6 py-16 lg:py-20">
      {children}
    </section>
  );
}

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mx-auto max-w-2xl space-y-2 text-center">
      <h2 className="text-3xl font-semibold tracking-tight text-balance">{title}</h2>
      <p className="text-muted">{sub}</p>
    </div>
  );
}
