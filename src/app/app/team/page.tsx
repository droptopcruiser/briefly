import Link from "next/link";
import { requireManager } from "@/lib/metering";
import { listMembers, listInvites } from "@/lib/team";
import { TeamInviteForm } from "@/app/team-invite-form";
import { inviteTeammate, removeTeammate, revokeTeammateInvite } from "@/app/team-actions";

export default async function TeamPage() {
  const { account, membership } = await requireManager();
  const [members, invites] = await Promise.all([
    listMembers(account.id),
    listInvites(account.id),
  ]);

  return (
    <div className="space-y-8">
      <Link href="/app" className="text-sm text-muted hover:text-foreground">
        ← Dashboard
      </Link>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-muted max-w-xl">
          Invite colleagues into {account.name || "your firm"}. Everyone shares the same matters and
          rubrics; you can assign matters to specific teammates.
        </p>
      </header>

      {/* Invite */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Invite a teammate</h2>
        <TeamInviteForm action={inviteTeammate} />
        <p className="text-xs text-muted">
          They join by signing in with this Google email — no invite link needed. Admins can manage
          the team and settings; members work matters.
        </p>
      </section>

      {/* Members */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Members</h2>
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">
                  {m.name || m.email || "Unknown"}
                  {m.userId === membership.userId ? (
                    <span className="text-muted font-normal"> (you)</span>
                  ) : null}
                </div>
                {m.name && m.email ? (
                  <div className="text-xs text-muted truncate">{m.email}</div>
                ) : null}
              </div>
              <span className="rounded-full border border-border px-2.5 py-1 text-xs capitalize text-muted">
                {m.role}
              </span>
              {m.role !== "owner" ? (
                <form action={removeTeammate}>
                  <input type="hidden" name="userId" value={m.userId} />
                  <button type="submit" className="text-sm text-muted hover:text-error">
                    Remove
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {/* Pending invites */}
      {invites.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Pending invites</h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {invites.map((inv) => (
              <li key={inv.id} className="flex items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{inv.email}</div>
                  <div className="text-xs text-muted">
                    Invited as {inv.role} · joins on first sign-in
                  </div>
                </div>
                <form action={revokeTeammateInvite}>
                  <input type="hidden" name="inviteId" value={inv.id} />
                  <button type="submit" className="text-sm text-muted hover:text-error">
                    Revoke
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
