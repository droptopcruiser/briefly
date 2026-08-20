"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const OPEN_EVENT = "briefly-open-evidence";

/**
 * Open the evidence drawer, optionally focused on a specific fact (its factSlug) —
 * the "conclusion → evidence" jump. Usable from anywhere (header, sticky bar, an
 * insight factor) since it just dispatches a window event.
 */
export function openEvidence(fact?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: fact ? { fact } : undefined }));
}

/** Opens the evidence drawer from anywhere (header, sticky bar) via a window event. */
export function OpenEvidenceButton({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => openEvidence()}
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:bg-inset hover:text-foreground"
      }
    >
      {children ?? (
        <>
          <span aria-hidden="true">▤</span> Evidence
        </>
      )}
    </button>
  );
}

/**
 * The Evidence Drawer — the matter record as something you PULL FORWARD to verify,
 * not a place you navigate to. A right-side Liquid Glass slide-over (full-width on
 * mobile, expandable for a continuous audit) holding the source-backed facts,
 * documents, gaps, timeline, and activity. Why Briefly reached its conclusion and
 * where every claim came from — one keystroke away from the decision, then gone.
 */
export function EvidenceDrawer({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const pendingFocus = useRef<string | null>(null);

  const close = useCallback(() => setOpen(false), []);

  // Open on the window event (from the header / sticky bar / an insight factor).
  useEffect(() => {
    const onOpen = (e: Event) => {
      restoreTo.current = document.activeElement as HTMLElement | null;
      pendingFocus.current = (e as CustomEvent<{ fact?: string }>).detail?.fact ?? null;
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  // While open: lock body scroll, close on Esc, move focus in and restore on close.
  // If opened focused on a fact, scroll it into view and light it (shared amber wash).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    const targetSlug = pendingFocus.current;
    pendingFocus.current = null;
    let litEl: HTMLElement | null = null;
    let litTimer: ReturnType<typeof setTimeout> | undefined;
    if (targetSlug) {
      requestAnimationFrame(() => {
        litEl = panelRef.current?.querySelector<HTMLElement>(`[data-evi-fact="${targetSlug}"]`) ?? null;
        if (litEl) {
          litEl.scrollIntoView({ block: "center", behavior: "smooth" });
          litEl.classList.add("evi-lit");
          litTimer = setTimeout(() => litEl?.classList.remove("evi-lit"), 1900);
        }
      });
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      if (litTimer) clearTimeout(litTimer);
      litEl?.classList.remove("evi-lit");
      restoreTo.current?.focus?.();
    };
  }, [open]);

  return (
    <div className={`fixed inset-0 z-40 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div
        onClick={close}
        className={`absolute inset-0 bg-foreground/30 backdrop-blur-[2px] transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Matter evidence"
        tabIndex={-1}
        className={`absolute inset-y-0 right-0 flex w-full flex-col border-l border-[var(--glass-border)] bg-[var(--glass-panel)] backdrop-blur-2xl outline-none transition-[transform,width] duration-200 sm:w-[34rem] ${
          expanded ? "sm:w-[58rem] sm:max-w-[95%]" : ""
        } ${open ? "translate-x-0" : "translate-x-full"}`}
        style={{ boxShadow: "var(--glass-shadow), var(--glass-hi)" }}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3.5">
          <h2 className="font-serif text-lg font-medium tracking-tight text-foreground">Evidence</h2>
          <span className="text-sm text-muted">the matter record</span>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="hidden rounded-md p-1.5 text-muted outline-none hover:bg-inset hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent sm:inline-flex"
              title={expanded ? "Collapse" : "Expand for a full read"}
              aria-label={expanded ? "Collapse drawer" : "Expand drawer"}
            >
              {expanded ? "⇥" : "⇤"}
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded-md p-1.5 text-muted outline-none hover:bg-inset hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Close evidence"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </aside>
    </div>
  );
}
