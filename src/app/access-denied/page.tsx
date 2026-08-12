import { getAuthUser } from "@/lib/auth";
import { signOut } from "@/app/actions";

/**
 * Shown when a user authenticated successfully but their email isn't on the
 * allowlist (ALLOWED_EMAILS). They can sign out and try a different account.
 */
export default async function AccessDeniedPage() {
  const user = await getAuthUser();

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-sm flex-col justify-center gap-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Access denied</h1>
      <p className="text-sm text-muted">
        {user?.email ? (
          <>
            <span className="font-medium text-foreground">{user.email}</span> isn&apos;t
            authorised to access this workspace.
          </>
        ) : (
          <>This account isn&apos;t authorised to access this workspace.</>
        )}
      </p>
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-inset"
        >
          Sign out and try another account
        </button>
      </form>
    </div>
  );
}
