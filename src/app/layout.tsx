import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getAuthUser } from "@/lib/auth";
import { getNotifications } from "@/lib/notifications";
import { getCurrentProfile } from "@/lib/profile";
import { NotificationBell } from "./notification-bell";
import { ProfileMenu } from "./profile-menu";

export const metadata: Metadata = {
  title: "Briefly — your work, ready when you are",
  description:
    "Briefly prepares your work before you get to it — the way your firm works. Client emails arrive as structured, review-ready matters, waiting the moment you sit down.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Non-redirecting read, so /login and /access-denied still render.
  const user = await getAuthUser();
  const notifications = user ? await getNotifications() : null;
  const profile = user ? await getCurrentProfile() : null;

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-border">
          <div className="mx-auto max-w-5xl px-6 h-14 flex items-center justify-between">
            <Link href="/" className="font-semibold tracking-tight text-lg">
              Briefly
            </Link>
            {user ? (
              <div className="flex items-center gap-3 text-xs text-muted">
                {notifications ? (
                  <NotificationBell count={notifications.count} items={notifications.items} />
                ) : null}
                <Link href="/app" className="hover:text-foreground">
                  Dashboard
                </Link>
                {profile ? <ProfileMenu profile={profile} /> : null}
              </div>
            ) : (
              <Link
                href="/login"
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-background"
              >
                Sign in
              </Link>
            )}
          </div>
        </header>
        <main className="flex-1 mx-auto w-full max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
