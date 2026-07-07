// Madrid-timezone formatters for the coach citas (videollamada) surfaces. Every
// appointment/exception timestamp renders in Europe/Madrid so the coach always reads
// the same clock the athlete booked against, regardless of the browser's locale/TZ.

const TZ = 'Europe/Madrid';

const DATE_TIME_FMT = new Intl.DateTimeFormat('es-ES', {
  timeZone: TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const DATE_FMT = new Intl.DateTimeFormat('es-ES', {
  timeZone: TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** "mié, 9 jul, 17:30" — an appointment instant (ISO) in Madrid time. */
export function formatCitaDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return DATE_TIME_FMT.format(d);
}

/** "jueves, 9 de julio" — a calendar day. Accepts a plain YYYY-MM-DD (blocked-date
 *  exceptions) or a full ISO instant. Plain dates anchor to 12:00 UTC so the Madrid
 *  calendar day never shifts. */
export function formatCitaDate(value: string): string {
  const d = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return '';
  return DATE_FMT.format(d);
}
