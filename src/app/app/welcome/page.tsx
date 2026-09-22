import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getCurrentAccount, isUserOnboarded, isOnboarded } from "@/lib/metering";
import { acceptPendingInvite } from "@/lib/team";
import { redeemInvite } from "@/app/onboarding-actions";
import { InviteForm } from "@/app/welcome-forms";
import { PracticeOnboarding } from "@/app/practice-onboarding";

export default async function WelcomePage() {
  const user = await requireUser();

  // A teammate invited by email joins their firm automatically on first sign-in,
  // skipping onboarding entirely (the firm is already set up).
  if (!(await getCurrentAccount()) && (await acceptPendingInvite(user))) {
    redirect("/app");
  }

  const account = await getCurrentAccount();

  // Step 1 — invite code (gates account provisioning). Server-rendered so the page
  // re-fetches once the account exists.
  if (!account) {
    return (
      <div className="mx-auto max-w-md space-y-8 pt-8">
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-muted">Step 1 of 3</div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight">Welcome to Briefly</h1>
          <p className="text-muted">Enter your invite code to get started.</p>
        </div>
        <InviteForm action={redeemInvite} />
      </div>
    );
  }

  // Finished the welcome flow already → straight to the app.
  if (await isUserOnboarded()) redirect("/app");

  // Steps 2–4 (firm → work → books) run client-side so the flow doesn't reload.
  return <PracticeOnboarding initialFirmName={isOnboarded(account) ? account.name : null} />;
}
