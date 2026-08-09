import { listStuckMatters } from "@/lib/store";
import { getAccountById } from "@/lib/metering";
import { nudgeMatter } from "@/lib/reminders";

// Each stuck matter may regenerate a chase (one Haiku call) — give headroom.
export const maxDuration = 300;

/**
 * The invisible sweep behind "Briefly noticed this was stuck". Runs daily (Vercel
 * Cron); finds matters awaiting the client past the threshold and drafts a
 * follow-up chase for each (never sends — human gate). Idempotent: throttled by
 * each matter's last_nudged_at, so re-runs don't pile up chases.
 *
 * Auth: gated by CRON_SECRET (Vercel sends it as `Authorization: Bearer`; also
 * accepts `?token=`). `?days=N` overrides the threshold for manual testing.
 */

const DEFAULT_DAYS = Number(process.env.FOLLOWUP_AFTER_DAYS ?? 3);

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  if (url.searchParams.get("token") === secret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

async function runSweep(req: Request): Promise<Response> {
  if (!authorized(req)) return jsonResponse(401, { error: "unauthorized" });

  const url = new URL(req.url);
  const daysParam = url.searchParams.get("days");
  const thresholdDays = daysParam !== null ? Number(daysParam) : DEFAULT_DAYS;

  const stuck = await listStuckMatters(thresholdDays);
  let nudged = 0;
  for (const matter of stuck) {
    if (!matter.result?.draftEmail || !matter.accountId) continue;
    const account = await getAccountById(matter.accountId);
    if (!account) continue;
    try {
      if (await nudgeMatter(account, matter)) nudged++;
    } catch (err) {
      console.error(`nudge failed for matter ${matter.id}:`, err);
    }
  }

  return jsonResponse(200, { scanned: stuck.length, nudged, thresholdDays });
}

// Vercel Cron issues a GET; allow POST too for manual triggering.
export async function GET(req: Request): Promise<Response> {
  return runSweep(req);
}
export async function POST(req: Request): Promise<Response> {
  return runSweep(req);
}
