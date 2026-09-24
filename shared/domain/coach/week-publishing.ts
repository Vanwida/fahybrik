// @fahybrid/shared/domain/coach/week-publishing — cuándo ve el atleta una semana.
//
// UNA PUERTA (DECISIONS 2026-08-10 y 2026-08-18): el atleta ve una semana salvo
// que su fila de `weekly_plans` diga `draft`. Sin fila, SE VE. Este módulo no
// añade otra puerta: decide QUÉ ESCRIBIR en esa fila cuando se entrega un
// programa, y cuándo la abre sola el cron.
//
// Tres formas de entregar (la elige el coach al asignar):
//   · visible — todas las semanas publicadas ya.
//   · draft   — todas retenidas: ocultas hasta que el coach las publique.
//   · auto    — cada semana se abre sola N días antes de empezar (N = dato del
//               coach, `coaches.auto_publish_days_before`, con defecto aquí).
//
// RETENER no es un estado nuevo: es `draft` + `delivery_mode = 'manual'`, lo
// mismo que ya escribían el borrador privado, el alta y el MCP (mig 0217).
//
// POR QUÉ N ES DATO (HARD RULE Nº0): uno entrega el sábado, otro el domingo por
// la noche, otro el mismo lunes. El MECANISMO (una semana se abre sola N días
// antes, una retenida no se abre nunca sola) es nuestro; N es del coach.

import { addDays, isoDateString, parseIsoDate } from '../dates';

/** Defecto de N: el sábado antes del lunes. Es lo que hacía el cron del sábado. */
export const DEFAULT_AUTO_PUBLISH_DAYS_BEFORE = 2;
/** Barrera de cordura del sistema (mecanismo), no método: 0 = el mismo lunes. */
export const AUTO_PUBLISH_DAYS_MIN = 0;
export const AUTO_PUBLISH_DAYS_MAX = 28;

export const WEEK_DELIVERY_VALUES = ['auto', 'visible', 'draft'] as const;
export type WeekDelivery = (typeof WEEK_DELIVERY_VALUES)[number];

/** Lo que dice `weekly_plans` de una semana. `null` = no hay fila (se ve). */
export interface WeekRowState {
  status: 'draft' | 'published' | 'archived';
  delivery_mode: 'scheduled' | 'manual';
}

/** Lo que hay que dejar escrito. `keep` = no tocar la fila. */
export type WeekWrite =
  | { kind: 'keep' }
  | { kind: 'publish' }
  | { kind: 'draft_auto' }
  | { kind: 'hold' };

export function effectiveAutoPublishDays(stored: number | null | undefined): number {
  if (stored == null || !Number.isFinite(stored)) return DEFAULT_AUTO_PUBLISH_DAYS_BEFORE;
  return Math.min(AUTO_PUBLISH_DAYS_MAX, Math.max(AUTO_PUBLISH_DAYS_MIN, Math.trunc(stored)));
}

/** El día en que una semana en borrador automático se abre sola. */
export function autoPublishDate(week_start: string, days_before: number): string {
  return isoDateString(addDays(parseIsoDate(week_start), -days_before));
}

/** ¿Ya tocaba que el atleta viera esta semana (hoy ≥ lunes − N)? */
export function isWithinAutoWindow(week_start: string, today: string, days_before: number): boolean {
  return autoPublishDate(week_start, days_before) <= today;
}

/** Una semana que ya acabó (su domingo es anterior a hoy). */
export function isPastWeek(week_start: string, today: string): boolean {
  return isoDateString(addDays(parseIsoDate(week_start), 6)) < today;
}

export function isHeld(row: WeekRowState | null): boolean {
  return row != null && row.status === 'draft' && row.delivery_mode === 'manual';
}

export function athleteSeesWeek(row: WeekRowState | null): boolean {
  return row == null || row.status !== 'draft';
}

/**
 * La regla automática para UNA semana de un programa recién entregado:
 *   · retenida → no se toca (el coach la retuvo a propósito; nada automático la
 *     suelta);
 *   · dentro de la ventana (hoy ≥ lunes − N) → publicada;
 *   · ya publicada con fila → no se toca (lo automático nunca le quita al atleta
 *     algo que ya puede estar viendo);
 *   · si no → borrador automático (se abrirá sola).
 */
export function autoWeekWrite(
  row: WeekRowState | null,
  week_start: string,
  today: string,
  days_before: number,
): WeekWrite {
  if (isHeld(row)) return { kind: 'keep' };
  if (isWithinAutoWindow(week_start, today, days_before)) {
    return row == null || row.status !== 'draft' ? { kind: 'keep' } : { kind: 'publish' };
  }
  if (row != null && row.status !== 'draft') return { kind: 'keep' };
  return row != null && row.delivery_mode === 'scheduled' ? { kind: 'keep' } : { kind: 'draft_auto' };
}

/** Qué escribir en una semana según la entrega elegida al asignar. */
export function deliveryWeekWrite(
  delivery: WeekDelivery,
  row: WeekRowState | null,
  week_start: string,
  today: string,
  days_before: number,
): WeekWrite {
  switch (delivery) {
    case 'visible':
      return row == null || row.status !== 'draft' ? { kind: 'keep' } : { kind: 'publish' };
    case 'draft':
      return isHeld(row) ? { kind: 'keep' } : { kind: 'hold' };
    case 'auto':
      return autoWeekWrite(row, week_start, today, days_before);
    default: {
      const _exhaustive: never = delivery;
      return _exhaustive;
    }
  }
}

/**
 * Quitar la retención de una semana la devuelve a lo automático: si ya tocaba
 * verla, se publica en el acto (no espera al cron de mañana).
 */
export function releaseHoldWrite(week_start: string, today: string, days_before: number): WeekWrite {
  return isWithinAutoWindow(week_start, today, days_before) ? { kind: 'publish' } : { kind: 'draft_auto' };
}
