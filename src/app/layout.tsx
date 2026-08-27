import type { Metadata } from "next";
import { Newsreader } from "next/font/google";
import "./globals.css";

// The editorial signature: a warm, authored text serif for "prepared work" —
// headlines, the insight, the brief, the client message — so Briefly reads like
// a considered brief, not another sans-serif dashboard. Wired into --font-serif.
const editorial = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-editorial",
  display: "swap",
});
import { getAuthUser } from "@/lib/auth";
import { getNotifications } from "@/lib/notifications";
import { getCurrentProfile } from "@/lib/profile";
import {
  getCurrentAccount,
  getCurrentMembership,
  intakeAddress,
  isManager,
  isOnboarded,
} from "@/lib/metering";
import { Shell } from "./shell";

export const metadata: Metadata = {
  title: "Briefly — the work before the work, done before you open it",
  description:
    "Whatever your client actually sends — a note, PDFs, a photo of the contract — Briefly reads it, checks it against your checklist, chases what's missing, and hands you a ready file. Keep working the way you do.",
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Non-redirecting reads, so /login and /access-denied still render. Everything
  // is fetched once here (helpers are request-cached) and handed to the Shell,
  // so pages never re-query for navigation.
  const user = await getAuthUser();
  const [notifications, profile, membership, account] = user
    ? await Promise.all([
        getNotifications(),
        getCurrentProfile(),
        getCurrentMembership(),
        getCurrentAccount(),
      ])
    : [null, null, null, null];

  return (
    <html lang="en" className={`h-full antialiased ${editorial.variable}`} suppressHydrationWarning>
      <body className="min-h-full">
        {/* No-flash theme: apply an explicit choice before first paint; absence
            means "system", which the prefers-color-scheme media query handles. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var m=localStorage.getItem('briefly:theme');if(m==='light'||m==='dark'){document.documentElement.setAttribute('data-theme',m);}}catch(e){}",
          }}
        />
        <Shell
          authed={Boolean(user)}
          isManager={isManager(membership?.role)}
          profile={profile}
          notifications={notifications}
          intake={account ? intakeAddress(account.inboundToken) : null}
          firmName={isOnboarded(account) ? account.name : null}
          roleLabel={membership ? ROLE_LABELS[membership.role] ?? null : null}
        >
          {children}
        </Shell>
      </body>
    </html>
  );
}
