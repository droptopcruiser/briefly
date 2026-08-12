"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { Profile } from "@/lib/profile";
import type { NotifItem } from "@/lib/notifications";
import { NotificationBell } from "./notification-bell";
import { ProfileMenu } from "./profile-menu";

/**
 * The app chrome. A single client shell decides, from the pathname, whether a
 * route is public (minimal header) or in-app (role-aware left sidebar + top
 * strip). Server data is fetched once in layout.tsx and passed down as props so
 * every page shares the same navigation without re-querying.
 *
 * Responsive: a persistent rail ≥1024px; below that the sidebar collapses behind
 * a menu button and opens as a focus-trapped overlay drawer (Esc / backdrop close).
 */

interface ShellProps {
  authed: boolean;
  isManager: boolean;
  profile: Profile | null;
  notifications: { count: number; items: NotifItem[] } | null;
  intake: string | null;
  firmName: string | null;
  roleLabel: string | null;
  children: ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  match: (p: string) => boolean;
}

// Humanist, stroke-based icons — one visual family, 18px.
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

const WORK: NavItem[] = [
  {
    href: "/app",
    label: "Home",
    match: (p) => p === "/app",
    icon: (
      <Icon>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
      </Icon>
    ),
  },
  {
    href: "/app/matters",
    label: "Matters",
    match: (p) => p === "/app/matters" || p.startsWith("/matters"),
    icon: (
      <Icon>
        <path d="M4 5h9l2 2h5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
      </Icon>
    ),
  },
  {
    href: "/app/clients",
    label: "Clients",
    match: (p) => p.startsWith("/app/clients"),
    icon: (
      <Icon>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
        <path d="M16 5.2a3 3 0 0 1 0 5.6" />
        <path d="M17 20a5.5 5.5 0 0 0-3-4.9" />
      </Icon>
    ),
  },
];

const MANAGE: NavItem[] = [
  {
    href: "/app/rubrics",
    label: "Matter types",
    match: (p) => p.startsWith("/app/rubrics"),
    icon: (
      <Icon>
        <path d="M8 6h12" />
        <path d="M8 12h12" />
        <path d="M8 18h12" />
        <circle cx="4" cy="6" r="1" />
        <circle cx="4" cy="12" r="1" />
        <circle cx="4" cy="18" r="1" />
      </Icon>
    ),
  },
  {
    href: "/app/team",
    label: "Team",
    match: (p) => p.startsWith("/app/team"),
    icon: (
      <Icon>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
        <path d="M16 5.2a3 3 0 0 1 0 5.6" />
        <path d="M17 20a5.5 5.5 0 0 0-3-4.9" />
      </Icon>
    ),
  },
  {
    href: "/app/settings",
    label: "Settings",
    match: (p) => p.startsWith("/app/settings"),
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
      </Icon>
    ),
  },
];

function IntakeCard({ intake }: { intake: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-inset px-3 py-2.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
        Intake address
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{intake}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(intake);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard unavailable — no-op */
            }
          }}
          className="shrink-0 rounded-md px-1.5 py-1 text-[11px] font-medium text-accent hover:bg-accent-soft"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function NavGroup({
  title,
  items,
  pathname,
  onNavigate,
}: {
  title?: string;
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-1">
      {title ? (
        <div className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
          {title}
        </div>
      ) : null}
      {items.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-accent-soft font-medium text-accent"
                : "text-muted hover:bg-inset hover:text-foreground"
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

function SidebarInner({
  isManager,
  intake,
  firmName,
  roleLabel,
  pathname,
  onNavigate,
}: {
  isManager: boolean;
  intake: string | null;
  firmName: string | null;
  roleLabel: string | null;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="flex h-14 items-center px-5">
        <Link
          href="/app"
          onClick={onNavigate}
          className="font-serif text-lg font-semibold tracking-tight"
        >
          Briefly
        </Link>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Primary">
        <NavGroup items={WORK} pathname={pathname} onNavigate={onNavigate} />
        {isManager ? (
          <NavGroup title="Manage" items={MANAGE} pathname={pathname} onNavigate={onNavigate} />
        ) : null}
      </nav>

      <div className="space-y-3 border-t border-border px-3 py-4">
        {intake ? <IntakeCard intake={intake} /> : null}
        {firmName ? (
          <div className="px-2">
            <div className="truncate text-sm font-medium text-foreground">{firmName}</div>
            {roleLabel ? <div className="text-xs text-muted">{roleLabel}</div> : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

function AppChrome({
  isManager,
  profile,
  notifications,
  intake,
  firmName,
  roleLabel,
  pathname,
  children,
}: Omit<ShellProps, "authed"> & { pathname: string }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // While the drawer is open: lock body scroll, trap focus, close on Esc.
  useEffect(() => {
    if (!drawerOpen) return;
    const panel = panelRef.current;
    document.body.style.overflow = "hidden";

    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input,[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    focusable()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawerOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  return (
    <div className="min-h-screen lg:flex">
      {/* Persistent rail ≥1024px */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <SidebarInner
          isManager={isManager}
          intake={intake}
          firmName={firmName}
          roleLabel={roleLabel}
          pathname={pathname}
        />
      </aside>

      {/* Overlay drawer <1024px */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${drawerOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!drawerOpen}
      >
        <div
          onClick={() => setDrawerOpen(false)}
          className={`absolute inset-0 bg-foreground/30 transition-opacity duration-200 ${
            drawerOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <aside
          ref={panelRef}
          inert={drawerOpen ? undefined : true}
          className={`absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-surface shadow-xl transition-transform duration-200 ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <SidebarInner
            isManager={isManager}
            intake={intake}
            firmName={firmName}
            roleLabel={roleLabel}
            pathname={pathname}
            onNavigate={() => setDrawerOpen(false)}
          />
        </aside>
      </div>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur lg:px-8">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="rounded-md p-1.5 text-muted hover:bg-inset hover:text-foreground lg:hidden"
          >
            <Icon>
              <path d="M3 6h18M3 12h18M3 18h18" />
            </Icon>
          </button>

          <form
            onSubmit={(e) => e.preventDefault()}
            role="search"
            className="min-w-0 flex-1 max-w-sm"
          >
            <label htmlFor="app-search" className="sr-only">
              Search
            </label>
            <input
              id="app-search"
              type="search"
              placeholder="Search matters, clients…"
              className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-muted"
            />
          </form>

          <div className="ml-auto flex items-center gap-2">
            {notifications ? (
              <NotificationBell count={notifications.count} items={notifications.items} />
            ) : null}
            {profile ? <ProfileMenu profile={profile} /> : null}
          </div>
        </header>

        <main className="flex-1">
          <div className="mx-auto w-full max-w-5xl px-4 py-8 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

function PublicHeader({ authed, profile }: { authed: boolean; profile: Profile | null }) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Link href="/" className="font-serif text-lg font-semibold tracking-tight">
          Briefly
        </Link>
        {authed ? (
          <div className="flex items-center gap-3 text-sm text-muted">
            <Link href="/app" className="hover:text-foreground">
              Open app
            </Link>
            {profile ? <ProfileMenu profile={profile} /> : null}
          </div>
        ) : (
          <Link
            href="/login"
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}

export function Shell(props: ShellProps) {
  const pathname = usePathname();
  // In-app chrome for the authed product surface; onboarding + public routes get
  // a focused minimal header instead of the full sidebar.
  const isApp =
    props.authed &&
    pathname !== "/app/welcome" &&
    (pathname.startsWith("/app") || pathname.startsWith("/matters"));

  if (isApp) {
    return (
      <AppChrome
        isManager={props.isManager}
        profile={props.profile}
        notifications={props.notifications}
        intake={props.intake}
        firmName={props.firmName}
        roleLabel={props.roleLabel}
        pathname={pathname}
      >
        {props.children}
      </AppChrome>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader authed={props.authed} profile={props.profile} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{props.children}</main>
    </div>
  );
}
