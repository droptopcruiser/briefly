"use client";

import { useState } from "react";

/**
 * The matter page as one source of truth with three contextual views:
 * Matter record · Next step · Consultation plan. The facts live once (in the
 * record); the other two reference them and do their own job. Server-rendered
 * panels are passed as nodes; switching just toggles which is visible, so each
 * panel keeps its own streamed (Suspense) content.
 */
export function MatterTabs({
  tabs,
  defaultTab,
}: {
  tabs: { id: string; label: string; node: React.ReactNode }[];
  defaultTab: string;
}) {
  const [active, setActive] = useState(
    tabs.some((t) => t.id === defaultTab) ? defaultTab : tabs[0]?.id,
  );

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Matter views"
        className="flex flex-wrap gap-1 rounded-lg border border-border bg-inset p-1"
      >
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              type="button"
              onClick={() => setActive(t.id)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                on
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {t.label}
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
