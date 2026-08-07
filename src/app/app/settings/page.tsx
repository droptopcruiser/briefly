import Link from "next/link";
import { requireAccount, intakeAddress } from "@/lib/metering";
import { senderAddress, isEmailConfigured } from "@/lib/email";
import { saveSettings } from "@/app/actions";
import { SettingsForm } from "@/app/settings-form";

export default async function SettingsPage() {
  const account = await requireAccount();
  const address = senderAddress();
  const configured = isEmailConfigured();

  // The seed placeholder shouldn't pre-fill the input — invite a real name.
  const currentName = account && account.name !== "Default firm" ? account.name : "";

  return (
    <div className="space-y-8">
      <Link href="/app" className="text-sm text-muted hover:text-foreground">
        ← Dashboard
      </Link>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted max-w-xl">
          How Briefly represents your firm when it sends follow-ups to clients.
        </p>
      </header>

      {!account ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
          Account settings need the database connected — not available in local demo mode.
        </p>
      ) : (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">Outbound follow-ups</h2>
          <SettingsForm
            initialName={currentName}
            initialSignature={account.emailSignature ?? ""}
            initialReplyToMode={account.replyToMode ?? ""}
            initialReplyToEmail={account.replyToEmail ?? ""}
            address={address}
            intakeAddress={intakeAddress(account.inboundToken)}
            action={saveSettings}
          />
          <p className="text-xs text-muted max-w-xl">
            Emails send from a shared, verified Briefly address, shown as{" "}
            <span className="font-medium">&ldquo;Briefly on behalf of your firm&rdquo;</span> — honest
            about the sending domain and safe from spam filters. Sending from your firm&apos;s own
            domain is coming later.
            {!configured ? " (Email sending isn't configured on this environment yet.)" : ""}
          </p>
        </section>
      )}
    </div>
  );
}
