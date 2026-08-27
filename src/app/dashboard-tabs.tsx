"use client";

import { useState } from "react";

/**
 * Dashboard matter list, tabbed — Needs you · Awaiting client · Everything.
 * Each list is server-rendered and passed as a node; switching just toggles which
 * is visible, so the readiness meters and rows keep their server rendering.
 */
export function DashboardTabs({
  tabs,
}: {
  tabs: { id: string; label: string; count: number; node: React.ReactNode }[];
}) {
  const [active, setActive] = useState(tabs[0]?.id);
  return (
    <div className="space-y-4">
      <div className="glass-card glass-sheen inline-flex gap-1 rounded-full p-1 text-sm">
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium transition-colors ${
                on ? "bg-accent text-accent-fg shadow-[var(--shadow-sm)]" : "text-muted hover:text-foreground"
              }`}
            >
              {t.label}
              {t.count > 0 ? (
                <span
                  className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                    on ? "bg-accent-fg/20" : "bg-inset text-muted"
                  }`}
                >
                  {t.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div key={t.id} hidden={t.id !== active}>
          {t.node}
        </div>
      ))}
    </div>
  );
}
