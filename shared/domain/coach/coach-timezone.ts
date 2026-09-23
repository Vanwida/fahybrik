// @fahybrid/shared/domain/coach/coach-timezone — el huso horario del coach (su
// estudio): el reloj de su agenda (huecos de cita, días bloqueados, «llamadas
// hoy»). Es DATO del coach (`coaches.timezone`, mig 0241); sin él, el defecto del
// producto `BOX_TIMEZONE`. Un valor que no sea una zona IANA válida se trata como
// ausente (nunca rompe una página por un dato malo).
//
// Puro y sin base de datos.

import { BOX_TIMEZONE, mondayOfWeek, parseIsoDate, zonedDayString } from '../dates';

/** ¿Es una zona IANA que el motor de fechas entiende? */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** El huso efectivo del coach: el suyo si es válido, si no el defecto. */
export function effectiveCoachTimezone(stored: string | null | undefined): string {
  const t = (stored ?? '').trim();
  return t.length > 0 && isValidTimezone(t) ? t : BOX_TIMEZONE;
}

/**
 * El día del calendario en que cae `instant` en el huso `tz`, como fecha a
 * medianoche UTC (compone con `addDays`, `mondayOfWeek`, `isoDateString`). Es
 * `startOfDayInBox` con el huso del coach en vez del defecto.
 */
export function startOfDayInTz(instant: Date, tz: string): Date {
  return parseIsoDate(zonedDayString(instant, tz));
}

/** El lunes de la semana en que cae `instant` en el huso `tz` (medianoche UTC). */
export function mondayOfWeekInTz(instant: Date, tz: string): Date {
  return mondayOfWeek(startOfDayInTz(instant, tz));
}

/** «Hoy» del coach como `YYYY-MM-DD`. */
export function todayInTz(instant: Date, tz: string): string {
  return zonedDayString(instant, tz);
}

/** La ciudad de un huso, para «hora de Madrid» / «hora de Mexico City». */
export function timezoneCity(tz: string): string {
  const last = tz.split('/').at(-1) ?? tz;
  return last.replace(/_/g, ' ');
}
