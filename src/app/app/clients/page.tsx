import Link from "next/link";
import { requireAccount } from "@/lib/metering";
import { listClients } from "@/lib/clients";

export default async function ClientsPage() {
  const account = await requireAccount();
  const clients = await listClients(account.id);

  return (
    <div className="space-y-6">
      <Link href="/app" className="text-sm text-muted hover:text-foreground">
        ← Dashboard
      </Link>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
        <p className="text-muted max-w-xl">
          Everyone who&apos;s sent your firm an enquiry. Briefly remembers what it learns about each
          one across matters.
        </p>
      </header>

      {clients.length === 0 ? (
        <p className="text-sm text-muted">No clients yet — they appear once an enquiry comes in.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {clients.map((c) => (
            <li key={c.id}>
              <Link
                href={`/app/clients/${c.id}`}
                className="flex items-center gap-4 px-4 py-3 hover:bg-inset transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{c.name ?? c.email}</div>
                  {c.name ? <div className="text-xs text-muted truncate">{c.email}</div> : null}
                </div>
                <span className="shrink-0 text-xs text-muted tabular-nums">
                  {c.matterCount} {c.matterCount === 1 ? "matter" : "matters"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
