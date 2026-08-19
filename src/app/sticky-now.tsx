"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Keeps the decision reachable. Wraps the full "Now" hero; once the hero scrolls up
 * under the app header, a compact glass bar slides in at the top carrying the
 * workflow status, the decision, and a way to act — so the professional never loses
 * the next move below the fold. A genuinely floating layer, so glass earns its place.
 */
export function StickyNow({ bar, children }: { bar: React.ReactNode; children: React.ReactNode }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [past, setPast] = useState(false);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setPast(!entry.isIntersecting && entry.boundingClientRect.top <= 0),
      // Fire when the hero's foot passes under the sticky app header (h-14 ≈ 56px).
      { rootMargin: "-72px 0px 0px 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <div
        aria-hidden={!past}
        className={`fixed inset-x-0 top-14 z-20 border-b border-[var(--glass-border)] bg-[var(--glass-nav-fill)] backdrop-blur-xl transition-all duration-200 lg:left-64 ${
          past ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0"
        }`}
        style={{ boxShadow: past ? "var(--glass-shadow)" : "none" }}
      >
        <div className="mx-auto w-full max-w-5xl px-4 py-2 lg:px-8">{bar}</div>
      </div>

      {children}
      <div ref={sentinel} aria-hidden="true" className="h-px" />
    </>
  );
}
