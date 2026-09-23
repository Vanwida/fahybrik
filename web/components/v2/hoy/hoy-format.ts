// Textos de Hoy que dependen de fechas. Puros (se prueban en node).

import { ageLabel, shortDate } from '@fahybrid/shared/domain/coach/athlete-state';
import { BOX_TIMEZONE, zonedDayString } from '@fahybrid/shared/domain/dates';
import { plusDays, weekdayDate, mondayOf } from '@/components/v2/shared/format';

const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;

/** Hoy en el huso del coach (`HoyView.timezone`), YYYY-MM-DD. */
export function boxToday(now: Date, tz: string = BOX_TIMEZONE): string {
  return zonedDayString(now, tz);
}

/** «miércoles 23 sept», en el día del coach. */
export function longDateLabel(now: Date, tz: string = BOX_TIMEZONE): string {
  const iso = boxToday(now, tz);
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return `${DIAS_LARGOS[dow]} ${shortDate(iso)}`;
}

/** Día en que se publica sola la semana que empieza en `monday` (lunes − N). */
export function autoPublishDay(monday: string, days: number): string {
  return plusDays(monday, -days);
}

/**
 * Lo siguiente que va a pasar, para el «Todo al día»: lo pospuesto que vuelve
 * antes, o si no el día en que se publica sola la semana que viene.
 */
export function nextExpectedLine(params: {
  today: string;
  auto_publish_days: number;
  /** Fechas ISO de vuelta de lo pospuesto (null = hasta nueva señal). */
  snoozed_until: ReadonlyArray<string | null>;
}): string {
  const dated = params.snoozed_until.filter((u): u is string => u != null).sort();
  if (dated.length > 0) {
    const first = dated[0]!.slice(0, 10);
    const n = dated.filter((u) => u.slice(0, 10) === first).length;
    const when = first <= params.today ? 'hoy' : `el ${weekdayDate(first)}`;
    return n === 1 ? `Un pospuesto vuelve ${when}.` : `${n} pospuestos vuelven ${when}.`;
  }
  const nextMonday = plusDays(mondayOf(params.today), 7);
  const opens = autoPublishDay(nextMonday, params.auto_publish_days);
  if (opens <= params.today) {
    return `La semana del ${weekdayDate(nextMonday)} ya se está publicando sola.`;
  }
  return `La semana del ${weekdayDate(nextMonday)} se publica sola el ${weekdayDate(opens)}.`;
}

/** «hasta nueva señal» / «hasta el vie 25 sept». */
export function untilLabel(until: string | null): string {
  if (!until) return 'hasta nueva señal';
  return `hasta el ${weekdayDate(until.slice(0, 10))}`;
}

/** «hace 2 h» para una marca ISO. */
export function agoLabel(iso: string, now: Date): string {
  const a = ageLabel(iso, now);
  return a === 'ahora' ? 'ahora' : `hace ${a}`;
}
