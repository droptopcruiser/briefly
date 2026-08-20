const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * One human date/time format everywhere — never a raw system timestamp.
 *   full:    "Thursday, 27 August 2026 · 9:15 AM"
 *   compact: "27 Aug · 9:15 AM"
 * (Client renders that use this should carry suppressHydrationWarning, since the
 * time is formatted in the viewer's local zone.)
 */
export function formatWhen(iso: string, opts: { compact?: boolean } = {}): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  let h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, "0");
  const ampm = h < 12 ? "AM" : "PM";
  h = h % 12 || 12;
  const time = `${h}:${min} ${ampm}`;
  if (opts.compact) return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} · ${time}`;
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${time}`;
}

/** The weekday alone, e.g. "Thursday" — for "Prepared for Thursday's consultation". */
export function weekday(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "the" : WEEKDAYS[d.getDay()];
}
