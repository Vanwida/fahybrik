// Cómo dice el motor de ajuste semanal lo que ha decidido, en UNA línea que Hoy
// enseña tal cual («su semana no pide cambios · …»). Puro, sin base de datos; lo
// comparten el botón (lib/dashboard/coach/weekly-evaluation.ts) y el cron
// (lib/coach/ai-propose-week-adjustment.ts). Vocabulario del panel: adherencia
// con su ventana, «entreno», nunca «cumplimiento» ni «sesión dura».

import { isoDateString, startOfDayInBox } from '@fahybrid/shared/domain/dates';

/** «Mantener» dicho con su motivo, en una línea (Hoy la enseña tal cual). */
export function keepSummary(summary: string): string {
  return summary && summary !== 'Datos limitados esta semana'
    ? `Su semana no pide cambios · ${summary}`
    : 'Su semana no pide cambios';
}

/** Por qué el motor sin IA no puede proponer un cambio concreto (en una línea). */
export function heuristicNoChangeReason(sessionsLeft: number, recoveryId: string | null): string {
  if (sessionsLeft === 0) return 'No le quedan entrenos esta semana que se puedan suavizar';
  if (!recoveryId) return 'No hay un entreno de recuperación en tu biblioteca para cambiarlo: ajústalo a mano';
  return 'Revísalo a mano en su semana';
}

/**
 * Desde qué día se puede suavizar un entreno de la semana `week_start…week_end`:
 * si la semana es la de hoy, desde hoy (lo pasado ya no se cambia); si no, la
 * semana entera.
 */
export function suggestFrom(week_start: string, week_end: string, now: Date = new Date()): string {
  const today = isoDateString(startOfDayInBox(now));
  return today >= week_start && today <= week_end ? today : week_start;
}
