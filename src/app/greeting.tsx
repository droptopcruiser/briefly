"use client";

import { useEffect, useState } from "react";

/**
 * The time-of-day greeting, computed in the VIEWER's local timezone — not the server
 * (UTC) or a stored firm timezone, which is why "Good morning" showed at 7:40 PM in
 * Auckland. The browser's own clock handles DST automatically. Rendered after mount
 * so SSR (server zone) never fixes the wrong greeting into the markup.
 */
export function Greeting({ name }: { name: string | null }) {
  const [part, setPart] = useState<string | null>(null);

  useEffect(() => {
    const h = new Date().getHours();
    setPart(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
  }, []);

  const lead = part ?? "Welcome";
  return <>{name ? `${lead}, ${name}` : lead}</>;
}
