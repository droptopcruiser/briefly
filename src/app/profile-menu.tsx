"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "@/app/actions";
import type { Profile } from "@/lib/profile";

function initials(p: Profile): string {
  const base = p.name || p.email || "?";
  const parts = base.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function ProfileMenu({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Profile"
        className="block h-7 w-7 overflow-hidden rounded-full border border-border"
      >
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-surface text-[10px] font-medium text-foreground">
            {initials(profile)}
          </span>
        )}
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
          <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
            <div className="border-b border-border px-4 py-3">
              <div className="truncate text-sm font-medium">{profile.name ?? "You"}</div>
              {profile.email ? (
                <div className="truncate text-xs text-muted">{profile.email}</div>
              ) : null}
            </div>
            <Link
              href="/app/profile"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm hover:bg-inset"
            >
              Profile settings
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="block w-full px-4 py-2 text-left text-sm hover:bg-inset"
              >
                Sign out
              </button>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}
