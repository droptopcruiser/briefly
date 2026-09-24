"use client";

import { useState } from "react";

/**
 * Applicants & parties as tiles that DRILL IN. Each tile stays the index (name, role,
 * a line of identity, outstanding count); clicking it opens a right-hand panel with that
 * one person's full profile — identity (sourced), their dates, their files, their
 * outstanding. Not a fourth column on the matter page; a slide-in.
 */

export interface IdLine { label: string; value: string; source: string | null }
export interface DateLine { label: string; kind: "set" | "resolved" | "conflict"; value: string | null; candidates: { value: string; source: string }[] }
export interface PersonProfile {
  id: string;
  name: string;
  heading: string;
  unassigned?: boolean;
  identity: IdLine[];
  dates: DateLine[];
  files: string[];
  outstanding: string[];
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MON[(m || 1) - 1]} ${y}`; };

export function PersonTiles({ people }: { people: PersonProfile[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = people.find((p) => p.id === openId) ?? null;

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Applicants &amp; parties</div>
      <div className="grid gap-3 sm:grid-cols-2">
        {people.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpenId(p.id)}
            className={`rounded-xl border p-4 text-left transition-colors hover:border-accent/60 ${p.unassigned ? "border-awaiting/50 bg-awaiting-soft/40" : "border-border bg-raise"}`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-foreground">{p.name}</span>
              <span className="text-[11px] uppercase tracking-wide text-muted">{p.heading}</span>
            </div>
            {p.identity.length ? (
              <div className="mt-0.5 truncate text-xs text-muted">{p.identity.map((l) => l.value).join(" · ")}</div>
            ) : null}
            <div className="mt-2 text-sm text-muted">
              {p.outstanding.length
                ? `${p.outstanding.length} outstanding · view profile →`
                : "Nothing outstanding · view profile →"}
            </div>
          </button>
        ))}
      </div>

      {open ? (
        <>
          <button type="button" aria-label="Close" onClick={() => setOpenId(null)} className="fixed inset-0 z-30 cursor-default bg-black/20" />
          <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col overflow-y-auto border-l border-border bg-surface shadow-xl">
            <div className="sticky top-0 flex items-baseline justify-between gap-3 border-b border-border bg-surface px-5 py-4">
              <div>
                <h2 className="font-serif text-xl font-semibold tracking-tight">{open.name}</h2>
                <div className="text-[11px] uppercase tracking-wide text-muted">{open.heading}</div>
              </div>
              <button type="button" onClick={() => setOpenId(null)} className="text-muted hover:text-foreground">✕</button>
            </div>

            <div className="space-y-6 px-5 py-5">
              <Block title="Identity">
                {open.identity.length ? (
                  <dl className="space-y-2">
                    {open.identity.map((l, i) => (
                      <div key={i}>
                        <dt className="text-[11px] uppercase tracking-wide text-muted">{l.label}</dt>
                        <dd className="font-medium">{l.value}</dd>
                        {l.source ? <dd className="text-xs italic text-foreground/60">{l.source}</dd> : null}
                      </div>
                    ))}
                  </dl>
                ) : <Empty>Nothing on file yet.</Empty>}
              </Block>

              <Block title="Dates">
                {open.dates.length ? (
                  <ul className="space-y-2 text-sm">
                    {open.dates.map((d, i) => (
                      <li key={i}>
                        <span className="text-[11px] uppercase tracking-wide text-muted">{d.label}</span>
                        {d.kind === "conflict" ? (
                          <div className="text-awaiting">
                            <div className="font-medium">Conflict — {d.candidates.length} sources</div>
                            {d.candidates.map((c, j) => <div key={j} className="text-xs">{fmt(c.value)} — “{c.source}”</div>)}
                          </div>
                        ) : (
                          <div>
                            <span className="font-medium tabular-nums">{d.value ? fmt(d.value) : "—"}</span>
                            {d.kind === "resolved" ? <span className="text-accent"> · resolved</span> : null}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : <Empty>No dates on file.</Empty>}
              </Block>

              <Block title="Files">
                {open.files.length ? (
                  <ul className="space-y-1 text-sm">{open.files.map((f, i) => <li key={i} className="truncate">▤ {f}</li>)}</ul>
                ) : <Empty>No files attached.</Empty>}
              </Block>

              <Block title="Outstanding">
                {open.outstanding.length ? (
                  <ul className="space-y-1 text-sm text-foreground/85">{open.outstanding.map((o, i) => <li key={i}>· {o}</li>)}</ul>
                ) : <Empty>Nothing outstanding.</Empty>}
              </Block>
            </div>
          </aside>
        </>
      ) : null}
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{title}</h3>
      {children}
    </section>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}
