import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getCurrentProfile } from "@/lib/profile";
import { ProfileForms } from "@/app/profile-forms";
import { updateProfileName, uploadAvatar } from "@/app/profile-actions";

export default async function ProfilePage() {
  await requireUser();
  const profile = await getCurrentProfile();

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
    </div>
  );
}
