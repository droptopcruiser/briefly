const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A consultation is a WALL-CLOCK appointment ("9:15 AM on 27 Aug"), not an instant.
 * We read the date/time components straight off the ISO string — never through a
 * local Date getter — so the SAME value formats identically whether it renders on
 * the server (UTC) or the client (the viewer's zone). That is what keeps the header,
 * the plan, the sticky bar, and the list from disagreeing about the time.
 */
function parts(iso: string): { y: number; mo: number; day: number; h: number; mi: number } | null {
  const m = String(iso ?? "").match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  return { y: +m[1], mo: +m[2] - 1, day: +m[3], h: +m[4], mi: +m[5] };
}

/** Day-of-week for a wall-clock date, tz-agnostic (computed from the calendar date). */
function weekdayIndex(p: { y: number; mo: number; day: number }): number {
  return new Date(Date.UTC(p.y, p.mo, p.day)).getUTCDay();
}

/**
 * One human date/time format everywhere:
 *   full:    "Thursday, 27 August 2026 · 9:15 AM"
 *   compact: "27 Aug · 9:15 AM"
 */
export function formatWhen(iso: string, opts: { compact?: boolean } = {}): string {
  const p = parts(iso);
  if (!p) return "";
  const ampm = p.h < 12 ? "AM" : "PM";
  const h12 = p.h % 12 || 12;
  const time = `${h12}:${String(p.mi).padStart(2, "0")} ${ampm}`;
  if (opts.compact) return `${p.day} ${MONTHS_SHORT[p.mo]} · ${time}`;
  return `${WEEKDAYS[weekdayIndex(p)]}, ${p.day} ${MONTHS[p.mo]} ${p.y} · ${time}`;
}

/** The weekday alone, e.g. "Thursday" — for "Prepared for Thursday's consultation". */
export function weekday(iso: string): string {
  const p = parts(iso);
  return p ? WEEKDAYS[weekdayIndex(p)] : "the";
}

/**
 * Normalise a <input type="datetime-local"> value ("2026-08-27T09:15") to the stored
 * wall-clock ("2026-08-27T09:15:00") WITHOUT a timezone conversion, so the appointment
 * is preserved exactly as picked and every surface shows the same time. Returns null
 * for anything that isn't a valid local date-time.
 */
export function toWallClock(input: string): string | null {
  const m = String(input ?? "").match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return m ? `${m[1]}T${m[2]}:00` : null;
}
