/**
 * Instant matter-detail skeleton. Next.js shows this the moment the route starts
 * loading — the professional sees the page structure (header, facts, timeline,
 * prepared-work) immediately instead of a blank pane while the essential data
 * (account + matter) is fetched.
 */
export default function Loading() {
  const bar = (w: string) => <div className={`h-3 ${w} animate-pulse rounded bg-border`} />;
  return (
    <div className="space-y-8">
      <div className="h-3 w-20 animate-pulse rounded bg-border" />

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-7 w-52 animate-pulse rounded bg-border" />
          <div className="h-6 w-14 animate-pulse rounded-full bg-border" />
          <div className="h-6 w-24 animate-pulse rounded-full bg-border" />
        </div>
        <div className="flex gap-4">
          {bar("w-32")}
          {bar("w-24")}
          {bar("w-20")}
        </div>
        {bar("w-2/3")}
        <div className="h-1 w-full max-w-2xl animate-pulse rounded-full bg-inset" />
      </div>

      {/* Facts + timeline */}
      <div className="grid gap-8 md:grid-cols-2">
        {[0, 1].map((c) => (
          <div key={c} className="space-y-3">
            <div className="h-5 w-32 animate-pulse rounded bg-border" />
            <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-1.5">
                  {bar("w-24")}
                  {bar("w-3/4")}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Prepared work */}
      <div className="space-y-3">
        <div className="h-5 w-40 animate-pulse rounded bg-border" />
        <div className="h-40 w-full animate-pulse rounded-xl border border-border bg-surface" />
      </div>
    </div>
  );
}
