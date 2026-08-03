import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getAuthUser } from "@/lib/auth";
import { signOut } from "./actions";

export const metadata: Metadata = {
  title: "Briefly — AI intake layer",
  description:
    "Turn a messy client submission into a structured, reviewed, action-ready matter — before you touch it.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Non-redirecting read, so /login and /access-denied still render.
  const user = await getAuthUser();

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
                <span className="hidden sm:inline">{user.email}</span>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="rounded-md border border-border px-2.5 py-1 hover:bg-background hover:text-foreground"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            ) : (
              <span className="text-xs text-muted">the intake layer</span>
            )}
          </div>
        </header>
        <main className="flex-1 mx-auto w-full max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
