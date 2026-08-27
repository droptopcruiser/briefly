import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getCurrentProfile } from "@/lib/profile";
import { getCurrentAccount, intakeAddress } from "@/lib/metering";
import { ProfileForms } from "@/app/profile-forms";
import { updateProfileName, uploadAvatar } from "@/app/profile-actions";

export default async function ProfilePage() {
  await requireUser();
  const profile = await getCurrentProfile();
  const account = await getCurrentAccount();
  const intake = account ? intakeAddress(account.inboundToken) : null;

  return (
    <div className="max-w-xl space-y-8">
      <Link href="/app" className="text-sm text-muted hover:text-foreground">
        ← Dashboard
      </Link>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-muted">Your name and picture, shown across Briefly and to your team.</p>
      </header>

      {profile ? (
        <ProfileForms
          profile={profile}
          nameAction={updateProfileName}
          avatarAction={uploadAvatar}
        />
      ) : (
        <p className="text-sm text-muted">Sign in to manage your profile.</p>
      )}

      {intake ? (
        <section className="glass-card glass-sheen space-y-1.5 rounded-2xl px-5 py-4">
          <div className="text-xs font-medium uppercase tracking-wide text-muted">
            Your intake address
          </div>
          <div className="select-all break-all font-mono text-sm text-foreground">{intake}</div>
          <p className="text-xs text-muted">
            Forward client enquiries here (or set up auto-forwarding) and Briefly turns each one into
            a matter automatically. It&apos;s also pinned in your sidebar for quick copying.
          </p>
        </section>
      ) : null}
    </div>
  );
}
