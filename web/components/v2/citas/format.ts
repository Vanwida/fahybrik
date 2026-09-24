// Formateadores de las citas del coach (videollamada / presencial). Cada instante
// se pinta en el huso del CLUB (`coaches.timezone`, `useCoachTimeZone`), el mismo
// reloj con el que la agenda ofrece los huecos, sea cual sea el del navegador.

import { BOX_TIMEZONE } from '@fahybrid/shared/domain/dates';

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string, kind: 'datetime' | 'date'): Intl.DateTimeFormat {
  const key = `${tz}|${kind}`;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(
      'es-ES',
      kind === 'datetime'
        ? { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
        : { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' },
    );
    fmtCache.set(key, f);
  }
  return f;
}

/** "mié, 9 jul, 17:30" — una cita (ISO) en la hora del club. */
export function formatCitaDateTime(iso: string, tz: string = BOX_TIMEZONE): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return fmt(tz, 'datetime').format(d);
}

/** "jueves, 9 de julio" — un día. Acepta YYYY-MM-DD (días bloqueados) o un instante.
 *  Un día suelto es del calendario, no un instante: se pinta en UTC a mediodía para
 *  que ningún huso lo mueva; un instante, en la hora del club. */
export function formatCitaDate(value: string, tz: string = BOX_TIMEZONE): string {
  const plain = value.length === 10;
  const d = new Date(plain ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return '';
  return fmt(plain ? 'UTC' : tz, 'date').format(d);
}
