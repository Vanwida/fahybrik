// Date helpers for calendar-day planning. Planning is at *calendar-day*
// granularity, not minute granularity. Two distinct concerns live here, do not
// conflate them:
//
//   1. STORAGE / SERIALIZATION (timestamps): persisted as UTC. ISO calendar dates
//      (`YYYY-MM-DD`) are anchored at UTC midnight so they round-trip losslessly to
//      iOS (which receives ISO `YYYY-MM-DD` strings — that contract never changes).
//      The pure helpers below — parseIsoDate, isoDateString, addDays, diffDays,
//      startOfDayUtc, mondayOfWeek — operate on these canonical UTC-midnight Dates
//      and stay in UTC. They are safe: their input is *already* a calendar day, so
//      there is no wall-clock-to-day conversion happening.
//
//   2. WALL-CLOCK → DAY/WEEK (the coach's "today"): when a live instant (`new Date()`,
//      i.e. the moment the coach is acting) must be resolved to "what calendar day /
//      which Mon–Sun week is it *for the coach*", we interpret it in the coach's box
//      timezone, NOT UTC. Otherwise an action at 23:30 local in Barcelona resolves to
//      the *next* UTC day and the workout lands on the wrong day. Use
//      `startOfDayInBox(instant)` / `mondayOfWeekInBox(instant)` for this — never
//      `startOfDayUtc(new Date())`.
//
// FAHYBRIK is single-coach (Fabrik Training Club, Barcelona) so the box timezone is a
// single constant. If the product ever goes multi-box, this becomes a per-box field
// and these *InBox helpers grow a `tz` parameter.
export const BOX_TIMEZONE = 'Europe/Madrid';

export function parseIsoDate(d: string): Date {
  // YYYY-MM-DD → midnight UTC
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) throw new Error(`invalid ISO date: ${d}`);
  const [, y, mo, dd] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(dd)));
}

export function isoDateString(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

export function diffDays(a: Date, b: Date): number {
  const ms = a.getTime() - b.getTime();
  return Math.round(ms / 86_400_000);
}

export function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Monday of the ISO week containing `d` (UTC). */
export function mondayOfWeek(d: Date): Date {
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(startOfDayUtc(d), offset);
}

// Reused formatter — instantiating Intl.DateTimeFormat is comparatively expensive,
// so build it once. en-CA yields ISO-shaped `YYYY-MM-DD` parts.
const BOX_DATE_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: BOX_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Resolve a live instant to the calendar day it falls on *in the box timezone*,
 * returned as a UTC-midnight Date so it composes with the UTC calendar helpers above
 * (addDays, mondayOfWeek, isoDateString). Use this for the coach's "today" — never
 * `startOfDayUtc(new Date())`, which would shift across the UTC date boundary in the
 * evening (e.g. 23:30 Europe/Madrid).
 */
export function startOfDayInBox(instant: Date): Date {
  const parts = BOX_DATE_PARTS.formatToParts(instant);
  let y = 0;
  let mo = 0;
  let d = 0;
  for (const p of parts) {
    if (p.type === 'year') y = Number(p.value);
    else if (p.type === 'month') mo = Number(p.value);
    else if (p.type === 'day') d = Number(p.value);
  }
  return new Date(Date.UTC(y, mo - 1, d));
}

/** Monday (Mon–Sun week) of the box-local week containing the live instant `instant`. */
export function mondayOfWeekInBox(instant: Date): Date {
  return mondayOfWeek(startOfDayInBox(instant));
}
