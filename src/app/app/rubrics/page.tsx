import Link from "next/link";
import { requireManager } from "@/lib/metering";
import { getAccountRubrics } from "@/lib/rubric-store";
import { SEED_RUBRICS } from "@/lib/rubrics";
import { deleteRubric, duplicateSeed } from "@/app/rubric-actions";

export default async function RubricsPage() {
  const { account } = await requireManager();
  const rubrics = await getAccountRubrics(account.id);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Rubrics</h1>
          <p className="max-w-2xl text-sm text-muted">
            A rubric defines a matter type — the facts to extract, the documents required, and
            what&apos;s mandatory. Briefly classifies and extracts against these, so the same engine
            adapts to any practice.
          </p>
        </div>
        <Link
          href="/app/rubrics/new"
          className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90"
        >
          New rubric
        </Link>
      </div>

      {rubrics.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
          You haven&apos;t authored any rubrics yet, so Briefly is using its three built-in ones.
          Create your own or start from a template below.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {rubrics.map((r) => (
            <li key={r.id} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link href={`/app/rubrics/${r.id}`} className="font-medium hover:underline">
                  {r.name}
                </Link>
                <div className="text-xs text-muted">
                  {r.vertical} · {r.fields.length} fields · {r.documents.length} documents
                </div>
              </div>
              <Link
                href={`/app/rubrics/${r.id}`}
                className="text-sm text-muted hover:text-foreground"
              >
                Edit
              </Link>
              <form action={deleteRubric}>
                <input type="hidden" name="id" value={r.id} />
                <button type="submit" className="text-sm text-muted hover:text-red-600">
                  Delete
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Start from a template
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {SEED_RUBRICS.map((s) => (
            <div key={s.id} className="rounded-lg border border-border bg-surface p-4 space-y-2">
              <div className="text-sm font-medium">{s.name}</div>
              <div className="text-xs text-muted">
                {s.vertical} · {s.fields.length} fields · {s.documents.length} docs
              </div>
              <form action={duplicateSeed}>
                <input type="hidden" name="seedId" value={s.id} />
                <button type="submit" className="text-sm text-accent hover:underline">
                  Duplicate &amp; edit →
                </button>
              </form>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
