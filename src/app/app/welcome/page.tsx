import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getCurrentAccount, isOnboarded } from "@/lib/metering";
import { redeemInvite, completeOnboardingAction } from "@/app/onboarding-actions";
import { InviteForm, OnboardingForm } from "@/app/welcome-forms";

export default async function WelcomePage() {
  await requireUser();
  const account = await getCurrentAccount();
  if (isOnboarded(account)) redirect("/app");

  const step = account ? 2 : 1;

  return (
    <div className="mx-auto max-w-md space-y-8 pt-8">
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-muted">Step {step} of 2</div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {step === 1 ? "Welcome to Briefly" : "Set up your firm"}
        </h1>
        <p className="text-muted">
          {step === 1
            ? "Enter your invite code to get started."
            : "One detail and you're in. This is how Briefly represents you to clients."}
        </p>
      </div>

      {step === 1 ? (
        <InviteForm action={redeemInvite} />
      ) : (
        <OnboardingForm action={completeOnboardingAction} />
      )}
    </div>
  );
}
