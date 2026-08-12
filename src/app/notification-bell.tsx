"use client";

import { useState } from "react";
import Link from "next/link";
import type { NotifItem } from "@/lib/notifications";

export function NotificationBell({ count, items }: { count: number; items: NotifItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative rounded-md p-1.5 text-muted hover:bg-inset hover:text-foreground"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-medium leading-none text-accent-fg">
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
            <div className="border-b border-border px-4 py-2 text-sm font-medium">
              Needs your attention
            </div>
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">You&apos;re all caught up.</p>
            ) : (
              <ul className="max-h-96 divide-y divide-border overflow-auto">
                {items.map((i) => (
                  <li key={i.id}>
                    <Link
                      href={`/matters/${i.id}`}
                      onClick={() => setOpen(false)}
                      className="block px-4 py-2.5 hover:bg-inset"
                    >
                      <div className="truncate text-sm font-medium">
                        {i.clientName ?? "Unnamed client"}
                        {i.rubricName ? (
                          <span className="font-normal text-muted"> · {i.rubricName}</span>
                        ) : null}
                      </div>
                      <div
                        className={`text-xs ${
                          i.reason === "Follow-up ready"
                            ? "text-awaiting"
                            : "text-accent"
                        }`}
                      >
                        {i.reason}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/app"
              onClick={() => setOpen(false)}
              className="block border-t border-border px-4 py-2 text-center text-sm text-muted hover:text-foreground"
            >
              View all matters
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
