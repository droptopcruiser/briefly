"use client";

import { useActionState } from "react";
import type { Profile } from "@/lib/profile";
import type { ProfileResult } from "@/app/profile-actions";

type Action = (prev: ProfileResult, formData: FormData) => Promise<ProfileResult>;

function initials(p: Profile): string {
  const base = p.name || p.email || "?";
  const parts = base.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function ProfileForms({
  profile,
  nameAction,
  avatarAction,
}: {
  profile: Profile;
  nameAction: Action;
  avatarAction: Action;
}) {
  const [nameState, nameFormAction, namePending] = useActionState<ProfileResult, FormData>(
    nameAction,
    { ok: false },
  );
  const [avatarState, avatarFormAction, avatarPending] = useActionState<ProfileResult, FormData>(
    avatarAction,
    { ok: false },
  );

  return (
    <div className="space-y-8">
      {/* Avatar */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Profile picture</h2>
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 overflow-hidden rounded-full border border-border">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-surface text-lg font-medium">
                {initials(profile)}
              </span>
            )}
          </div>
          <form action={avatarFormAction} className="space-y-2">
            <input
              type="file"
              name="avatar"
              accept="image/*"
              className="block text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm"
            />
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={avatarPending}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
              >
                {avatarPending ? "Uploading…" : "Upload"}
              </button>
              {avatarState.ok ? (
                <span className="text-sm text-accent">Updated ✓</span>
              ) : avatarState.error ? (
                <span className="text-sm text-error">{avatarState.error}</span>
              ) : null}
            </div>
            <p className="text-xs text-muted">JPG or PNG, up to 2 MB.</p>
          </form>
        </div>
      </section>

      {/* Name */}
      <form action={nameFormAction} className="space-y-2 max-w-sm">
        <label htmlFor="name" className="text-sm font-medium">
          Display name
        </label>
        <input
          id="name"
          name="name"
          defaultValue={profile.name ?? ""}
          maxLength={80}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <p className="text-xs text-muted">Shown to your teammates.</p>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={namePending}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
          >
            {namePending ? "Saving…" : "Save"}
          </button>
          {nameState.ok ? (
            <span className="text-sm text-accent">Saved ✓</span>
          ) : nameState.error ? (
            <span className="text-sm text-error">{nameState.error}</span>
          ) : null}
        </div>
      </form>

      {/* Email (read-only) */}
      <div className="space-y-1.5 max-w-sm">
        <div className="text-sm font-medium">Email</div>
        <div className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
          {profile.email ?? "—"}
        </div>
        <p className="text-xs text-muted">From your Google sign-in.</p>
      </div>
    </div>
  );
}
