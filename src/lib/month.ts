/**
 * The start of the current calendar month, in a firm's timezone, returned as a
 * UTC ISO instant for querying `created_at`. Usage and "this month" stats use
 * this so month boundaries line up with the firm's local calendar, not UTC.
 * Falls back to UTC when the timezone is unset or invalid.
 */
export function monthStartISO(timezone?: string | null): string {
  const now = new Date();
  const tz = timezone?.trim();
  if (!tz) return utcMonthStart(now);

  try {
    const { year, month } = ymInTimeZone(now, tz);
    // Local midnight on the 1st, expressed as the matching UTC instant.
    const guess = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    return new Date(guess.getTime() - tzOffsetMs(guess, tz)).toISOString();
  } catch {
    return utcMonthStart(now);
  }
}

function utcMonthStart(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function ymInTimeZone(date: Date, tz: string): { year: number; month: number } {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit" });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { year: Number(p.year), month: Number(p.month) };
}

/** Milliseconds `tz` is ahead of UTC at `date` (handles DST). */
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUTC - date.getTime();
}
