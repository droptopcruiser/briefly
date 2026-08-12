import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccount } from "@/lib/metering";
import { getClientById, getClientMatters, getKnownFacts } from "@/lib/clients";
import { ReadinessBadge, StatusBadge } from "@/app/ui";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const account = await requireAccount();
  const client = await getClientById(account.id, id);
  if (!client) notFound();

  const [matters, facts] = await Promise.all([
    getClientMatters(account.id, client.email),
    getKnownFacts(account.id, client.email),
  ]);

  return (
    <div className="space-y-8">
      <Link href="/app/clients" className="text-sm text-muted hover:text-foreground">
        ← Clients
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{client.name ?? client.email}</h1>
        <p className="text-muted text-sm">
          {client.email} · {matters.length} {matters.length === 1 ? "matter" : "matters"}
        </p>
      </header>

      {/* Known facts */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">What Briefly knows</h2>
        {facts.length === 0 ? (
          <p className="text-sm text-muted">No known facts yet.</p>
        ) : (
          <dl className="rounded-lg border border-border bg-surface divide-y divide-border">
            {facts.map((f) => (
              <div key={f.key} className="px-4 py-3">
                <dt className="text-xs uppercase tracking-wide text-muted">{f.label}</dt>
                <dd className="font-medium">{f.value}</dd>
                <dd className="mt-1 text-xs text-muted">
                  From {f.originMatterName} · {f.date}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {/* Matters */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Matters</h2>
        {matters.length === 0 ? (
          <p className="text-sm text-muted">No matters.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {matters.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/matters/${m.id}`}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-inset transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{m.result?.rubricName ?? "Matter"}</div>
                    <div className="text-xs text-muted truncate">{m.submission.slice(0, 80)}…</div>
                  </div>
                  {m.result ? <ReadinessBadge value={m.result.readiness} /> : null}
                  <StatusBadge status={m.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
