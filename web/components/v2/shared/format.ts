// Fechas del panel en su vocabulario (plan §2): «22 sept», «lun 28 sept»,
// «24 d · 17 oct». Puras, sin huso: trabajan con días YYYY-MM-DD ya resueltos.

import { relativeDay, shortDate } from '@fahybrid/shared/domain/coach/athlete-state';
import { addDays, isoDateString, mondayOfWeek, parseIsoDate } from '@fahybrid/shared/domain/dates';

export { shortDate };

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const;
const DIAS_LETRA = ['D', 'L', 'M', 'X', 'J', 'V', 'S'] as const;

/** «lun 28 sept». */
export function weekdayDate(iso: string): string {
  const d = parseIsoDate(iso.slice(0, 10));
  return `${DIAS_CORTOS[d.getUTCDay()]} ${shortDate(iso)}`;
}

/** «vie» */
export function weekdayShort(iso: string): string {
  return DIAS_CORTOS[parseIsoDate(iso.slice(0, 10)).getUTCDay()]!;
}

/** «L», «M», «X»… */
export function weekdayLetter(iso: string): string {
  return DIAS_LETRA[parseIsoDate(iso.slice(0, 10)).getUTCDay()]!;
}

/** «28 sept – 25 oct» */
export function dateRange(from: string, to: string): string {
  return `${shortDate(from)} – ${shortDate(to)}`;
}

/** «24 d · 17 oct», «hoy», «mañana». */
export function countdown(days: number, iso: string): string {
  if (days <= 0) return 'hoy';
  if (days === 1) return `mañana · ${shortDate(iso)}`;
  return `${days} d · ${shortDate(iso)}`;
}

/** Hoy en el navegador, YYYY-MM-DD (fecha civil local). */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** El lunes de la semana de `iso`. */
export function mondayOf(iso: string): string {
  return isoDateString(mondayOfWeek(parseIsoDate(iso.slice(0, 10))));
}

/** `iso` + n días. */
export function plusDays(iso: string, n: number): string {
  return isoDateString(addDays(parseIsoDate(iso.slice(0, 10)), n));
}

/** Los próximos `count` lunes desde el de esta semana (incluido). */
export function upcomingMondays(today: string, count: number): string[] {
  const first = mondayOf(today);
  return Array.from({ length: count }, (_, i) => plusDays(first, i * 7));
}

/** «esta semana», «la semana que viene», o «lun 28 sept». */
export function mondayLabel(monday: string, today: string): string {
  const thisMonday = mondayOf(today);
  if (monday === thisMonday) return `Esta semana · ${weekdayDate(monday)}`;
  if (monday === plusDays(thisMonday, 7)) return `La que viene · ${weekdayDate(monday)}`;
  return weekdayDate(monday);
}

/** «hoy», «ayer» o «22 sept». */
export function relativeDayLabel(iso: string, today: string): string {
  return relativeDay(iso.slice(0, 10), today);
}
