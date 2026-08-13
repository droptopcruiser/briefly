"use client";

import { useEffect, useState } from "react";

type Mode = "system" | "light" | "dark";

const ORDER: Mode[] = ["system", "light", "dark"];
const LABEL: Record<Mode, string> = { system: "System", light: "Light", dark: "Dark" };

function apply(mode: Mode) {
  const el = document.documentElement;
  if (mode === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", mode);
}

/**
 * System / Light / Dark toggle. Default is System — the site keeps following the
 * device's appearance (dark in the evening if the OS is set to Auto). Light/Dark
 * force a choice, remembered across visits and applied before paint (see the
 * inline script in layout.tsx), so there's no flash.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [mode, setMode] = useState<Mode>("system");

  useEffect(() => {
    try {
      const s = localStorage.getItem("briefly:theme");
      if (s === "light" || s === "dark" || s === "system") setMode(s);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    setMode(next);
    apply(next);
    try {
      localStorage.setItem("briefly:theme", next);
    } catch {
      /* ignore */
    }
  };

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Theme: ${LABEL[mode]}. Click to change.`}
      title={`Theme: ${LABEL[mode]}`}
      className={`rounded-md p-1.5 text-muted transition-colors hover:bg-inset hover:text-foreground ${className}`}
    >
      {mode === "system" ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      ) : mode === "light" ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      )}
    </button>
  );
}
