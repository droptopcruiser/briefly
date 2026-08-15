"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

/**
 * The landing "briefing". One ownable idea: you arrive to a desk that was
 * prepared overnight. Fewer, larger motion moments — the work becoming ready,
 * never decoration. One easing curve; everything resolves instantly under
 * prefers-reduced-motion.
 */

const EASE = "cubic-bezier(0.16,1,0.3,1)";

function useReducedMotion() {
  const [rm, setRm] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => setRm(m.matches);
    set();
    m.addEventListener("change", set);
    return () => m.removeEventListener("change", set);
  }, []);
  return rm;
}

function useInView<T extends HTMLElement>(threshold = 0.3) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, inView };
}

export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.18);
  return (
    <div
      ref={ref}
      className={`reveal ${inView ? "in" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

// ── Small shared UI ──────────────────────────────────────────────────────────
function Check({ className = "text-accent" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function StatusPill({ status, tone }: { status: string; tone: string }) {
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${tone}`}>{status}</span>
  );
}

function Meter({ pct, bar = "bg-accent" }: { pct: number; bar?: string }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-inset">
      <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// The finished-matter data behind every proof surface (hero brief, workflow,
// the explore overlay). One engine, different intake per business.
type Intake = {
  client: string;
  type: string;
  vertical: string;
  readiness: number;
  fields: { label: string; value: string; source: string }[];
  gap: string;
  draft: string;
};

const INTAKES: Record<string, Intake> = {
  "Family Law": {
    client: "Priya Sharma",
    type: "Spousal visa",
    vertical: "Immigration",
    readiness: 82,
    fields: [
      { label: "Applicant", value: "Priya Sharma", source: "“my name is Priya Sharma and I’m hoping to apply…”" },
      { label: "Marriage date", value: "14 Sep 2023", source: "“we got married on 2023-09-14”" },
      { label: "Sponsor", value: "Daniel Okafor", source: "“my partner Daniel Okafor, he’s a citizen here”" },
      { label: "Current status", value: "Student visa", source: "“I’m currently on a student visa and living in-country”" },
    ],
    gap: "Marriage certificate not attached",
    draft: "Hi Priya — to complete your application we just need your marriage certificate. Everything else is in order; send that across and we’ll proceed.",
  },
  Veterinary: {
    client: "Sofia Bianchi",
    type: "New patient intake",
    vertical: "Veterinary",
    readiness: 74,
    fields: [
      { label: "Owner", value: "Sofia Bianchi", source: "“this is Sofia, bringing in my dog Rocco”" },
      { label: "Pet", value: "Rocco · Labrador", source: "“Rocco, he’s a 4-year-old Labrador”" },
      { label: "Symptoms", value: "Limping, off food", source: "“he’s been limping and off his food for 3 days”" },
      { label: "Vaccination", value: "Up to date (2024)", source: "“vaccinations done in spring, records attached”" },
    ],
    gap: "Weight not provided (needed for dosing)",
    draft: "Hi Sofia — thanks, Rocco’s records came through. Could you confirm his current weight so we can prepare the right dosage before your visit?",
  },
  Accounting: {
    client: "James Alvarez",
    type: "Year-end accounts",
    vertical: "Accounting",
    readiness: 68,
    fields: [
      { label: "Business", value: "Alvarez Design Ltd", source: "“I run Alvarez Design, a limited company”" },
      { label: "Tax year", value: "2023–24", source: "“this is for the 2023 to 2024 year”" },
      { label: "GST / VAT", value: "Registered", source: "“we’re VAT registered, quarterly”" },
      { label: "Turnover", value: "~£240k", source: "“turnover was around 240 thousand”" },
    ],
    gap: "Bank statements for Q4 missing",
    draft: "Hi James — I’ve got the year mapped out. To finish I just need your Q4 bank statements; once those are in we can file well ahead of the deadline.",
  },
};

// ── 1. Hero: arrive to a prepared desk ───────────────────────────────────────
// A wall of raw overnight email clears as a short, calm brief of prepared
// matters rises in its place. One large motion moment, once, then it holds.
const RAW_EMAILS = [
  { from: "Priya Sharma", snip: "applying for a spousal visa…", top: 2, left: 4, rot: -5 },
  { from: "M. Okafor", snip: "divorce — where do we start?", top: 0, left: 40, rot: 3 },
  { from: "Amara N.", snip: "asylum claim, quite urgent", top: 6, left: 72, rot: -3 },
  { from: "T. Weber", snip: "setting up a new company", top: 24, left: 20, rot: 4 },
  { from: "J. Alvarez", snip: "year-end accounts, VAT…", top: 22, left: 55, rot: -2 },
  { from: "R. Cho", snip: "partner visa (docs attached)", top: 20, left: 82, rot: 5 },
  { from: "S. Bianchi", snip: "my dog Rocco, limping…", top: 44, left: 6, rot: 2 },
  { from: "L. Fraser", snip: "property settlement query", top: 46, left: 38, rot: -4 },
  { from: "H. Kaur", snip: "student visa extension", top: 42, left: 68, rot: 3 },
  { from: "D. Mensah", snip: "bookkeeping for Q3", top: 64, left: 22, rot: -3 },
  { from: "E. Rossi", snip: "child custody question", top: 66, left: 54, rot: 4 },
  { from: "N. Adeyemi", snip: "employment dispute…", top: 62, left: 84, rot: -5 },
];

const BRIEF = [
  { name: "Priya Sharma", type: "Spousal visa", status: "Ready", tone: "border-accent text-accent", pct: 100, bar: "bg-accent" },
  { name: "Daniel Okafor", type: "Divorce petition", status: "Missing details", tone: "border-awaiting text-awaiting", pct: 68, bar: "bg-awaiting" },
  { name: "Amara Nwosu", type: "Asylum claim", status: "Follow-up drafted", tone: "border-border text-muted", pct: 52, bar: "bg-awaiting" },
  { name: "Tomás Weber", type: "Company formation", status: "Ready", tone: "border-accent text-accent", pct: 100, bar: "bg-accent" },
  { name: "Rebecca Cho", type: "Partner visa", status: "Ready", tone: "border-accent text-accent", pct: 100, bar: "bg-accent" },
];

export function PreparedDesk() {
  const reduced = useReducedMotion();
  const [on, setOn] = useState(reduced);
  useEffect(() => {
    if (reduced) {
      setOn(true);
      return;
    }
    const r = window.setTimeout(() => setOn(true), 750);
    return () => window.clearTimeout(r);
  }, [reduced]);

  const tr = (delay: number, dur: number, props: string) =>
    reduced
      ? undefined
      : props.split(",").map((p) => `${p.trim()} ${dur}ms ${EASE} ${delay}ms`).join(", ");

  return (
    <div className="relative h-[380px] select-none overflow-hidden sm:h-[440px]">
      {/* Overnight inbox — raw, dim, a little chaotic; it clears */}
      <div className="absolute inset-0" aria-hidden>
        {RAW_EMAILS.map((e, i) => (
          <div
            key={i}
            className={`absolute w-40 rounded-xl border border-border bg-surface/80 px-3 py-2 shadow-sm ${
              i > 7 ? "hidden sm:block" : ""
            }`}
            style={{
              top: `${e.top}%`,
              left: `${e.left}%`,
              transform: on
                ? "translateY(26px) scale(0.94)"
                : `rotate(${e.rot}deg)`,
              opacity: on ? 0 : 0.72,
              filter: on ? "blur(3px)" : "none",
              transition: tr(150 + i * 45, 700, "opacity, transform, filter"),
            }}
          >
            <div className="truncate text-[11px] font-medium text-muted">{e.from}</div>
            <div className="truncate text-[11px] text-muted/80">{e.snip}</div>
          </div>
        ))}
      </div>

      {/* Count: 43 unread → 7 ready */}
      <div className="absolute left-1 top-1 z-10 text-xs">
        <span
          className="text-muted"
          style={{ opacity: on ? 0 : 1, transition: tr(0, 400, "opacity") }}
        >
          43 unread
        </span>
      </div>

      {/* The morning brief rises into the space the inbox vacated */}
      <div className="absolute inset-x-0 top-1/2 z-20 -translate-y-1/2">
        <div
          style={{
            opacity: on ? 1 : 0,
            transform: on ? "none" : "translateY(18px)",
            transition: tr(650, 700, "opacity, transform"),
          }}
        >
          <div className="glass glass-sheen rounded-[26px] p-3 sm:p-4">
          <div className="flex items-center justify-between px-2 pb-3 pt-1">
            <div>
              <div className="text-sm font-semibold text-foreground">This morning</div>
              <div className="text-xs text-muted">Prepared while you were away</div>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              7 ready for you
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <ul className="divide-y divide-border">
              {BRIEF.map((m, i) => (
                <li
                  key={m.name}
                  className="px-3.5 py-2.5"
                  style={{
                    opacity: on ? 1 : 0,
                    transform: on ? "none" : "translateY(8px)",
                    transition: tr(820 + i * 80, 500, "opacity, transform"),
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1 truncate text-[13px] font-medium">
                      {m.name} <span className="font-normal text-muted">· {m.type}</span>
                    </div>
                    <StatusPill status={m.status} tone={m.tone} />
                  </div>
                  <div className="mt-1.5">
                    <Meter pct={m.pct} bar={m.bar} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Explore a sample intake — the interactive walkthrough ────────────────────
function FieldExplore({ field }: { field: Intake["fields"][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-raise">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left"
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{field.value}</div>
          <div className="text-[11px] text-muted">{field.label}</div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-accent">
          source
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
            style={{ transform: open ? "rotate(180deg)" : "none", transition: `transform 200ms ${EASE}` }}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      <div
        className="overflow-hidden px-3.5"
        style={{ maxHeight: open ? 80 : 0, transition: `max-height 260ms ${EASE}` }}
      >
        <p className="border-t border-border py-2.5 text-xs italic leading-relaxed text-muted">
          {field.source}
        </p>
      </div>
    </div>
  );
}

function MatterDetail({ intake }: { intake: Intake }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold tracking-tight">{intake.client}</div>
          <div className="text-sm text-muted">
            {intake.type} · {intake.vertical}
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold tabular-nums text-accent">
          {intake.readiness}%
        </span>
      </div>

      <div className="mt-4">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">
          Extracted facts — open one to see its source
        </div>
        <div className="space-y-2">
          {intake.fields.map((f) => (
            <FieldExplore key={f.label} field={f} />
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-error/40 bg-error-soft px-3.5 py-2.5 text-sm text-error">
        <span className="font-medium">Missing</span> · {intake.gap}
      </div>

      <div className="mt-4 rounded-xl border border-border bg-inset px-3.5 py-3">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
          Follow-up drafted
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-foreground">{intake.draft}</p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-accent">
          <span className="h-2 w-2 rounded-full bg-accent" /> Ready for your review
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="text-xs text-muted">Nothing sends until you approve</span>
          <span className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg">
            Approve &amp; send
          </span>
        </span>
      </div>
    </div>
  );
}

export function ExploreIntake({
  label = "Explore a sample intake",
  variant = "link",
}: {
  label?: string;
  variant?: "link" | "button";
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const industries = Object.keys(INTAKES);
  const [active, setActive] = useState(industries[0]);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    focusable()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const trigger =
    variant === "button" ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border bg-surface px-5 py-3 text-sm font-medium transition-colors hover:bg-inset"
      >
        {label}
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-foreground hover:text-accent"
      >
        {label} →
      </button>
    );

  return (
    <>
      {trigger}
      {mounted
        ? createPortal(
            <div
              className={`fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-4 sm:p-8 ${
                open ? "" : "pointer-events-none"
              }`}
              aria-hidden={!open}
            >
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 bg-foreground/40 backdrop-blur-sm transition-opacity duration-300"
          style={{ opacity: open ? 1 : 0 }}
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Explore a sample intake"
          className="glass glass-sheen relative z-10 my-auto w-full max-w-2xl rounded-3xl p-4 transition-all duration-300 sm:p-5"
          style={{
            opacity: open ? 1 : 0,
            transform: open ? "none" : "translateY(12px) scale(0.98)",
          }}
        >
          <div className="flex items-center justify-between gap-4 px-1 pb-3">
            <div>
              <div className="font-serif text-lg font-semibold tracking-tight">A sample intake</div>
              <div className="text-xs text-muted">Same engine, your business — switch below.</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded-md p-1.5 text-muted hover:bg-inset hover:text-foreground"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mb-4 inline-flex rounded-full border border-border bg-surface p-1">
            {industries.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setActive(name)}
                aria-pressed={active === name}
                className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                  active === name ? "bg-accent text-accent-fg" : "text-muted hover:text-foreground"
                }`}
              >
                {name}
              </button>
            ))}
          </div>

          <div key={active} className="anim-swapin">
            <MatterDetail intake={INTAKES[active]} />
          </div>
        </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

// ── 2. The fit: one living rubric workspace ──────────────────────────────────
/** A tasteable sample run per business line — a real inbound enquiry, the facts
 *  Briefly extracts (each with its source), the documents it recognises, and the
 *  first deliverable it drafts. Same engine, a different rulebook each time. */
type Fact = { label: string; value: string; src: string };
type Biz = {
  blurb: string;
  email: { from: string; subject: string; body: string };
  facts: Fact[];
  docs: string[];
  deliverable: { title: string; preview: string };
  alsoDrafts: string[];
};
const BUSINESSES: Record<string, Biz> = {
  Legal: {
    blurb: "New client matter",
    email: {
      from: "Sarah Whitfield",
      subject: "Starting divorce proceedings",
      body: "Hi, my husband James and I separated a few months ago after 9 years. We married on 14 September 2015 and have two children. I'd like to begin proceedings — I've attached our marriage certificate and a summary of our finances.",
    },
    facts: [
      { label: "Client & party", value: "Sarah Whitfield · v. James Whitfield", src: "my husband James and I separated" },
      { label: "Matter", value: "Divorce · 2 children", src: "have two children" },
      { label: "Key date", value: "Married 14 Sep 2015", src: "married on 14 September 2015" },
    ],
    docs: ["Marriage certificate", "Financial summary"],
    deliverable: {
      title: "Consultation confirmation",
      preview:
        "Dear Sarah, thank you for getting in touch. I've held a consultation slot and outlined the first steps and documents we'll need to begin…",
    },
    alsoDrafts: ["Engagement email", "Internal case brief"],
  },
  Property: {
    blurb: "Buyer enquiry",
    email: {
      from: "Daniel Osei",
      subject: "Viewing — 14 Marine Parade",
      body: "Hello, I'd like to arrange a viewing of 14 Marine Parade. I'm a cash buyer looking to move before December, budget around $1.2M. I've been pre-approved and can send the letter through.",
    },
    facts: [
      { label: "Party", value: "Daniel Osei · cash buyer", src: "I'm a cash buyer" },
      { label: "Property", value: "14 Marine Parade", src: "viewing of 14 Marine Parade" },
      { label: "Price & timing", value: "~$1.2M · before December", src: "budget around $1.2M" },
    ],
    docs: ["Pre-approval letter"],
    deliverable: {
      title: "Viewing confirmation",
      preview:
        "Hi Daniel, great to hear from you. I can offer viewings this week for 14 Marine Parade — here are two times that work…",
    },
    alsoDrafts: ["Appraisal booking", "Listing response"],
  },
  Accounting: {
    blurb: "New client onboarding",
    email: {
      from: "Mei Tan",
      subject: "Bookkeeping + tax for my Pte Ltd",
      body: "Hi, I run a small Pte Ltd (retail) and need bookkeeping plus help with this year's tax. Financial year ends 31 March and we're GST-registered. I can share Xero access and last year's return.",
    },
    facts: [
      { label: "Entity", value: "Pte Ltd · retail", src: "a small Pte Ltd (retail)" },
      { label: "Tax period", value: "FY end 31 Mar · GST-registered", src: "Financial year ends 31 March" },
      { label: "Service need", value: "Bookkeeping + tax", src: "need bookkeeping plus help with … tax" },
    ],
    docs: ["Xero access", "Prior year return"],
    deliverable: {
      title: "Onboarding next steps",
      preview:
        "Hi Mei, welcome aboard. Here's what we'll set up first and the access we'll need to get your books current…",
    },
    alsoDrafts: ["Engagement email", "Internal client brief"],
  },
};

function BusinessIcon({ name }: { name: string }) {
  const p = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "Legal")
    return (
      <svg {...p}>
        <path d="M12 3v18M6 21h12M5 7h14l-2-3H7L5 7Z" />
        <path d="M5 7l-2.5 5a2.5 2.5 0 0 0 5 0L5 7Zm14 0-2.5 5a2.5 2.5 0 0 0 5 0L19 7Z" />
      </svg>
    );
  if (name === "Property")
    return (
      <svg {...p}>
        <path d="M3 10.5 12 4l9 6.5M5 9.5V20h14V9.5M9.5 20v-6h5v6" />
      </svg>
    );
  return (
    <svg {...p}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 7h6M9 11h6M9 15h3" />
    </svg>
  );
}

function MiniDoc() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3v5h5" />
      <path d="M6 3h8l5 5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

export function RubricWorkspace() {
  const names = Object.keys(BUSINESSES);
  const [active, setActive] = useState(names[0]);
  const [stage, setStage] = useState(0); // 0 arriving · 1 extracting · 2 ready · 3 drafted
  const [runId, setRunId] = useState(0);
  const rm = useReducedMotion();
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const startedRef = useRef(false);
  const b = BUSINESSES[active];

  // Auto-play the first run when the section scrolls into view.
  useEffect(() => {
    if (inView && !startedRef.current) {
      startedRef.current = true;
      setRunId((n) => n + 1);
    }
  }, [inView]);

  // Drive the run whenever it (re)starts. Reduced motion → jump to the end.
  useEffect(() => {
    if (runId === 0) return;
    if (rm) {
      setStage(3);
      return;
    }
    setStage(0);
    const t = [
      setTimeout(() => setStage(1), 500),
      setTimeout(() => setStage(2), 1750),
      setTimeout(() => setStage(3), 2900),
    ];
    return () => t.forEach(clearTimeout);
  }, [runId, rm]);

  function pick(name: string) {
    setActive(name);
    setRunId((n) => n + 1);
  }

  const pct = stage === 0 ? 0 : stage === 1 ? 64 : 100;
  const reveal = (on: boolean, dy = 8, delay = 0) => ({
    opacity: on ? 1 : 0,
    transform: on ? "none" : `translateY(${dy}px)`,
    transition: `opacity 460ms ${EASE} ${delay}ms, transform 460ms ${EASE} ${delay}ms`,
  });

  return (
    <div ref={ref} className="mx-auto max-w-5xl">
      {/* Business line tabs */}
      <div className="flex justify-center">
        <div className="inline-flex flex-wrap justify-center gap-1 rounded-full border border-border bg-surface p-1">
          {names.map((name) => {
            const on = active === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => pick(name)}
                aria-pressed={on}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  on ? "bg-accent text-accent-fg" : "text-muted hover:text-foreground"
                }`}
              >
                <BusinessIcon name={name} />
                {name}
              </button>
            );
          })}
        </div>
      </div>

      {/* The run */}
      <div className="glass glass-sheen mt-6 overflow-hidden rounded-3xl">
        <div className="grid gap-px bg-border md:grid-cols-2">
          {/* Left — the inbound enquiry */}
          <div className="bg-surface p-6 sm:p-7">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              Inbound client email
            </div>
            <div key={`mail-${active}`} className="anim-swapin mt-4 rounded-xl border border-border bg-raise p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                  {b.email.from.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                </span>
                {b.email.from}
              </div>
              <div className="mt-3 text-sm font-medium">{b.email.subject}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{b.email.body}</p>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted" style={reveal(stage >= 1, 4)}>
              <span className={`h-1.5 w-1.5 rounded-full ${stage >= 2 ? "bg-accent" : "bg-awaiting"}`} />
              {stage === 0
                ? "Arriving…"
                : stage === 1
                  ? "Reading & checking your rulebook…"
                  : "Matched to your " + active + " rulebook"}
            </div>
          </div>

          {/* Right — the prepared file building */}
          <div key={`out-${active}`} className="anim-swapin bg-surface p-6 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                Prepared file
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
                  stage >= 2 ? "bg-accent-soft text-accent" : "bg-inset text-muted"
                }`}
              >
                {stage >= 2 ? <Check /> : null}
                {stage === 0 ? "—" : `${pct}% ready`}
              </span>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-inset">
              <div
                className={`h-full rounded-full ${stage >= 2 ? "bg-accent" : "bg-awaiting"}`}
                style={{ width: `${pct}%`, transition: `width 900ms ${EASE}, background-color 300ms` }}
              />
            </div>

            {/* Extracted, source-backed facts */}
            <ul className="mt-4 space-y-2.5">
              {b.facts.map((f, i) => (
                <li key={f.label} style={reveal(stage >= 1, 8, i * 140)}>
                  <div className="text-[11px] uppercase tracking-wide text-muted">{f.label}</div>
                  <div className="text-sm font-medium">{f.value}</div>
                  <div className="text-xs italic text-muted">“{f.src}”</div>
                </li>
              ))}
            </ul>

            {/* Documents recognised */}
            <div className="mt-4 flex flex-wrap gap-2" style={reveal(stage >= 2, 8)}>
              {b.docs.map((d) => (
                <span key={d} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-raise px-2.5 py-1 text-xs">
                  <Check /> {d}
                </span>
              ))}
            </div>

            {/* The drafted deliverable + human gate */}
            <div className="mt-5 rounded-xl border border-accent/40 bg-accent-soft p-4" style={reveal(stage >= 3, 10)}>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-accent">
                <MiniDoc /> Drafted · {b.deliverable.title}
              </div>
              <p className="mt-1.5 text-sm text-foreground">{b.deliverable.preview}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {b.alsoDrafts.map((d) => (
                  <span key={d} className="rounded-md bg-surface px-2 py-0.5 text-[11px] text-muted">
                    + {d}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-accent/20 pt-3 text-xs font-medium text-accent">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7l7-4Z" />
                </svg>
                Waiting for your approval
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-6 py-3">
          <p className="text-xs text-muted">
            Same engine, your rulebook — a real {active.toLowerCase()} enquiry, prepared and stopped
            at your review.
          </p>
          <button
            type="button"
            onClick={() => setRunId((n) => n + 1)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-inset"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Replay
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 3. The process: one full-width transformation ────────────────────────────
const PIPELINE = ["Classify", "Extract", "Flag gaps", "Draft reply", "Ready for review"];

export function ProcessCanvas() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState(reduced ? PIPELINE.length : 0);

  useEffect(() => {
    if (reduced) {
      setStage(PIPELINE.length);
      return;
    }
    const el = ref.current;
    if (!el) return;
    let timers: number[] = [];
    // Start only once the canvas is centred in view, and pace the beats slowly
    // so the visitor can follow each step. Replays if they scroll back to it.
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        timers.forEach(clearTimeout);
        setStage(0);
        timers = PIPELINE.map((_, i) => window.setTimeout(() => setStage(i + 1), 650 + i * 780));
      },
      { rootMargin: "-30% 0px -35% 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [reduced]);

  const intake = INTAKES["Family Law"];

  return (
    <div ref={ref} className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.1fr)]">
      {/* Raw email */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Incoming email</div>
        <div className="mt-3 text-sm font-medium">Priya Sharma</div>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Hi, my name is Priya Sharma and I’m hoping to apply for a spousal visa to stay with my
          partner. We got married on 2023-09-14. My partner Daniel Okafor is a citizen here; I’m
          currently on a student visa…
        </p>
        <div className="mt-3 inline-flex items-center gap-1 rounded-md bg-inset px-1.5 py-0.5 text-[11px]">
          passport.pdf
        </div>
      </div>

      {/* Pipeline lighting up */}
      <div className="flex flex-row items-center justify-center gap-3 lg:flex-col lg:items-stretch lg:gap-2">
        {PIPELINE.map((p, i) => {
          const done = stage >= i + 1;
          return (
            <div key={p} className="flex items-center gap-2">
              <span
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-medium tabular-nums transition-colors duration-300"
                style={
                  done
                    ? { background: "var(--accent)", color: "var(--accent-fg)" }
                    : { border: "1px solid var(--border)", color: "var(--muted)" }
                }
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className="hidden whitespace-nowrap text-xs transition-colors duration-300 lg:inline"
                style={{ color: done ? "var(--foreground)" : "var(--muted)" }}
              >
                {p}
              </span>
            </div>
          );
        })}
      </div>

      {/* Prepared matter builds */}
      <div className="glass glass-sheen rounded-3xl p-3 sm:p-4">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">{intake.client}</div>
              <div
                className="text-xs text-muted"
                style={{ opacity: stage >= 1 ? 1 : 0, transition: `opacity 300ms ${EASE}` }}
              >
                {intake.type} · matched
              </div>
            </div>
            <span
              className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold tabular-nums text-accent"
              style={{ opacity: stage >= 2 ? 1 : 0, transition: `opacity 300ms ${EASE}` }}
            >
              {intake.readiness}%
            </span>
          </div>

          <div
            className="overflow-hidden"
            style={{ maxHeight: stage >= 2 ? 200 : 0, marginTop: stage >= 2 ? 12 : 0, transition: `max-height 450ms ${EASE}, margin-top 450ms ${EASE}` }}
          >
            <div className="space-y-2 rounded-xl border border-border bg-raise p-3">
              {intake.fields.slice(0, 3).map((f, i) => (
                <div
                  key={f.label}
                  className="flex items-baseline justify-between gap-3"
                  style={{ opacity: stage >= 2 ? 1 : 0, transition: `opacity 300ms ${EASE} ${i * 90}ms` }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{f.value}</div>
                    <div className="text-[11px] text-muted">{f.label}</div>
                  </div>
                  <span className="shrink-0 text-[10px] text-accent">from message</span>
                </div>
              ))}
            </div>
          </div>

          <div
            className="overflow-hidden"
            style={{ maxHeight: stage >= 3 ? 60 : 0, marginTop: stage >= 3 ? 12 : 0, transition: `max-height 400ms ${EASE}, margin-top 400ms ${EASE}` }}
          >
            <div className="flex items-center gap-2 rounded-xl border border-error/40 bg-error-soft px-3 py-2 text-xs text-error">
              <span className="font-medium">Missing</span> · {intake.gap}
            </div>
          </div>

          <div
            className="overflow-hidden"
            style={{ maxHeight: stage >= 4 ? 120 : 0, marginTop: stage >= 4 ? 12 : 0, transition: `max-height 400ms ${EASE}, margin-top 400ms ${EASE}` }}
          >
            <div className="rounded-xl border border-border bg-inset px-3 py-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Follow-up drafted</div>
              <p className="mt-1 text-xs leading-relaxed text-foreground">{intake.draft}</p>
            </div>
          </div>

          <div
            className="overflow-hidden"
            style={{ maxHeight: stage >= 5 ? 60 : 0, transition: `max-height 400ms ${EASE}` }}
          >
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Ready for your review
              </span>
              <span className="rounded-md border border-accent px-2.5 py-1 text-xs font-medium text-accent">
                Approve &amp; send
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Thread stays together ────────────────────────────────────────────────────
export function ThreadingProof() {
  const reduced = useReducedMotion();
  const { ref, inView } = useInView<HTMLDivElement>(0.4);
  const [folded, setFolded] = useState(false);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setFolded(true);
      return;
    }
    const t = window.setTimeout(() => setFolded(true), 500);
    return () => window.clearTimeout(t);
  }, [inView, reduced]);

  return (
    <div ref={ref} className="mx-auto grid max-w-4xl items-center gap-8 lg:grid-cols-2">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight text-balance">
          One client intake. One matter.
        </h2>
        <p className="mt-3 text-muted">
          Replies, documents, and follow-ups fold into the same thread — the matter just gets more
          complete. Only a genuinely new intake uses capacity.
        </p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          <span className="tabular-nums font-medium">18 / 60</span>
          <span className="text-muted">matters used this month</span>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent">unchanged</span>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
        <div className="text-sm font-semibold">Priya Sharma · Spousal visa</div>
        <ol className="mt-4 space-y-0 border-l border-border pl-5">
          {[
            { t: "Enquiry received", d: "readiness 41%" },
            { t: "Follow-up sent", d: "awaiting client" },
          ].map((e) => (
            <li key={e.t} className="relative pb-4">
              <span className="absolute -left-[1.42rem] top-1.5 h-2 w-2 rounded-full bg-border" />
              <div className="text-sm">{e.t}</div>
              <div className="text-xs text-muted">{e.d}</div>
            </li>
          ))}
          <li
            className="relative overflow-hidden"
            style={{
              transition: `opacity 550ms ${EASE}, max-height 550ms ${EASE}, transform 550ms ${EASE}`,
              maxHeight: folded ? 80 : 0,
              opacity: folded ? 1 : 0,
              transform: folded ? "none" : "translateY(-6px)",
            }}
          >
            <span className="absolute -left-[1.42rem] top-1.5 h-2 w-2 rounded-full bg-accent" />
            <div className="flex items-center gap-2 text-sm">
              Client replied
              <span className="inline-flex items-center gap-1 rounded-md bg-inset px-1.5 py-0.5 text-[11px] text-foreground">
                marriage_certificate.pdf
              </span>
            </div>
            <div className="text-xs text-accent">readiness 41% → 100% · same matter</div>
          </li>
        </ol>
      </div>
    </div>
  );
}

// ── Two-path triage ───────────────────────────────────────────────────────────

/** Ease a number 0 → target once `run` flips true (instant under reduced-motion). */
function useCountUp(target: number, run: boolean, ms = 1100): number {
  const [v, setV] = useState(0);
  const rm = useReducedMotion();
  useEffect(() => {
    if (!run) return;
    if (rm) {
      setV(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setV(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, target, ms, rm]);
  return v;
}

function MailGlyph() {
  return (
    <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent-soft text-accent">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    </span>
  );
}

function ForkGlyph() {
  return (
    <span className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface text-accent shadow-sm">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="6" cy="6" r="2.4" />
        <circle cx="18" cy="6" r="2.4" />
        <circle cx="12" cy="19" r="2.4" />
        <path d="M6 8.5v2a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-2" />
        <path d="M12 13.5v3" />
      </svg>
    </span>
  );
}

/** One outcome card — Path A (missing) in honey, Path B (ready) in forest. */
function PathCard({
  variant,
  show,
  delay,
}: {
  variant: "A" | "B";
  show: boolean;
  delay: number;
}) {
  const a = variant === "A";
  return (
    <div
      className="glass glass-sheen lift relative overflow-hidden rounded-2xl p-6 sm:p-7"
      style={{
        opacity: show ? 1 : 0,
        transform: show ? "none" : "translateY(18px)",
        transition: `opacity 620ms ${EASE} ${delay}ms, transform 620ms ${EASE} ${delay}ms`,
      }}
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        <span className={`h-1.5 w-1.5 rounded-full ${a ? "bg-awaiting" : "bg-accent"}`} />
        {a ? "Path A · Incomplete" : "Path B · 100% complete"}
      </div>
      <h3 className="mt-4 font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
        {a ? (
          <>
            Facts or documents <span className="italic text-awaiting">are missing.</span>
          </>
        ) : (
          <>
            The file is ready <span className="italic text-accent">for action.</span>
          </>
        )}
      </h3>
      <p className="mt-3 text-sm text-muted">
        {a
          ? "Briefly drafts a precise request for exactly what's outstanding — nothing more."
          : "Briefly drafts the first deliverable your complete-when rule calls for."}
      </p>

      <div
        className={`mt-5 rounded-xl border px-4 py-3 ${
          a ? "border-awaiting/40 bg-awaiting-soft" : "border-accent/40 bg-accent-soft"
        }`}
      >
        <div
          className={`flex items-center gap-1.5 text-xs font-semibold ${
            a ? "text-awaiting" : "text-accent"
          }`}
        >
          {a ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 3v5h5" />
              <path d="M6 3h8l5 5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
              <path d="M9 13h6M9 16h4" />
            </svg>
          )}
          {a ? "Drafted request" : "Drafted initial work"}
        </div>
        <p className="mt-1.5 text-sm font-medium">
          {a ? "“Please attach the marriage certificate.”" : "“Confirmation, next steps & consultation link.”"}
        </p>
        <p className="mt-1 text-xs text-muted">
          {a ? "Then: Awaiting information" : "Or: engagement email · case brief"}
        </p>
      </div>
    </div>
  );
}

export function TwoPathTriage() {
  const { ref, inView } = useInView<HTMLDivElement>(0.2);
  const rm = useReducedMotion();
  const show = inView || rm;
  const readiness = useCountUp(68, show);

  return (
    <div ref={ref}>
      {/* Asymmetric header */}
      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr] lg:items-end">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            The two-path triage
          </div>
          <h2 className="mt-4 font-serif text-4xl font-semibold leading-[1.05] tracking-tight text-balance sm:text-5xl">
            Every intake reaches <span className="italic text-accent">a clear fork.</span>
          </h2>
        </div>
        <p className="text-muted lg:pb-2">
          Briefly checks the email against your rubric, scores readiness, then drafts the right first
          move — whether facts are missing or the file is complete.
        </p>
      </div>

      {/* Intake card */}
      <div className="mt-10">
        <div className="glass glass-sheen relative flex flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-4">
          <div className="flex items-center gap-3">
            <MailGlyph />
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                Inbound client email
              </div>
              <div className="font-semibold">Extract facts &amp; check rubric</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">Readiness score</span>
            <span className="rounded-md bg-accent-soft px-2.5 py-1 text-sm font-semibold tabular-nums text-accent">
              {readiness}%
            </span>
          </div>
        </div>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-inset">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${show ? 68 : 0}%`, transition: `width 1100ms ${EASE}` }}
          />
        </div>
      </div>

      {/* Fork connector */}
      <div className="flex flex-col items-center pt-6">
        <div className={`line-draw ${show ? "in" : ""} h-8 w-px bg-border`} />
        <ForkGlyph />
        <p className="mt-3 text-center text-sm font-medium text-accent">
          Briefly matches the next action to the state of the matter
        </p>
      </div>

      {/* Split rule (desktop) */}
      <div className="relative mx-auto mt-4 hidden h-6 w-2/3 lg:block" aria-hidden>
        <div className={`line-grow ${show ? "in" : ""} absolute left-1/4 right-1/4 top-0 border-t border-border`} />
        <div className={`line-draw ${show ? "in" : ""} absolute left-1/4 top-0 h-6 w-px bg-border`} />
        <div className={`line-draw ${show ? "in" : ""} absolute right-1/4 top-0 h-6 w-px bg-border`} />
      </div>

      {/* The two paths */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <PathCard variant="A" show={show} delay={120} />
        <PathCard variant="B" show={show} delay={240} />
      </div>

      {/* Professional review */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-inset px-5 py-4">
        <p className="text-sm">
          <span className="font-medium">Professional review.</span>{" "}
          <span className="text-muted">
            Whichever path, Briefly stops at your desk — review, adjust if needed, then approve and
            send.
          </span>
        </p>
        <a href="#how" className="shrink-0 text-sm font-medium text-accent hover:opacity-80">
          See the review state →
        </a>
      </div>
    </div>
  );
}

// ── A summary is not a workflow ───────────────────────────────────────────────

export function SummaryVsWorkflow() {
  return (
    <div className="grid items-center gap-6 lg:grid-cols-[0.85fr_1.15fr]">
      {/* Generic summary — deliberately flat and inert */}
      <div className="rounded-2xl border border-border bg-inset p-6 sm:p-7">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          A generic summary
        </div>
        <p className="mt-4 font-serif text-xl leading-relaxed text-muted">
          “The client is seeking advice regarding a property settlement and has supplied some
          financial information.”
        </p>
        <div className="mt-5 space-y-1.5 border-t border-border pt-4 text-sm text-muted">
          <p>What is missing?</p>
          <p>Who owns the next step?</p>
          <p>Is it ready?</p>
        </div>
      </div>

      {/* Briefly triage — the answer, glass and alive */}
      <div className="glass glass-sheen lift rounded-2xl p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex items-center gap-2 font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-soft text-accent">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 5h16M4 12h16M4 19h10" />
              </svg>
            </span>
            Briefly triage
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
            <Check /> 68% ready
          </span>
        </div>

        <div className="grid gap-5 py-5 sm:grid-cols-3">
          {[
            { k: "Source-backed facts", v: "Parties · assets · children" },
            { k: "Gap identified", v: "Marriage certificate" },
            { k: "Next step", v: "Follow-up drafted" },
          ].map((c) => (
            <div key={c.k}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                {c.k}
              </div>
              <div className="mt-1.5 text-sm font-medium">{c.v}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl bg-accent-soft px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-accent">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7l7-4Z" />
            </svg>
            Waiting for your approval
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-accent">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </div>
      </div>
    </div>
  );
}
