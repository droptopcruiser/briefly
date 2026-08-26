"use client";

import { useEffect, useRef, useState } from "react";

const GOTO_EVENT = "matter-goto-tab";

/**
 * A button that jumps the matter to a given tab. Lets the "Now" overview point at
 * the drill-down where the full action lives, without the overview needing to own
 * the tab state (they communicate over a window event).
 */
export function GoToTab({
  tab,
  children,
  variant = "primary",
}: {
  tab: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(GOTO_EVENT, { detail: tab }))}
      className={
        variant === "primary"
          ? "btn-primary inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium"
          : "btn-control inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium"
      }
    >
      {children}
    </button>
  );
}

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
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onGoto = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (tabs.some((t) => t.id === id)) {
        setActive(id);
        // Land ON the tab content (so a jump to Conversation shows the thread),
        // not the top of the page.
        containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    window.addEventListener(GOTO_EVENT, onGoto);
    return () => window.removeEventListener(GOTO_EVENT, onGoto);
  }, [tabs]);

  return (
    <div ref={containerRef} className="scroll-mt-4 space-y-6">
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
