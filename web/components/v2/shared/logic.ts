// Lógica PURA de los componentes compartidos (textos y recuentos): sin React,
// para probarla en node (web/lib/coach/__tests__/shared-logic.test.ts).

import type { AssignPreview, AssignPreviewAthlete, WeekDelivery } from '@fahybrid/shared/schema/assign-many';
import type { AthleteWeekState } from '@fahybrid/shared/schema/week-publishing';
import type { PeekDay } from '@/lib/coach/athlete-peek';
import { dateRange, plusDays, weekdayDate, weekdayShort } from './format';

/** La línea corta que explica el estado. Pura (se prueba). */
export function weekStateLine(week: AthleteWeekState, today: string): string {
  const sunday = plusDays(week.week_start, 6);
  if (week.visible) {
    if (week.sessions === 0) return 'Visible · sin entrenos esa semana';
    return sunday < today ? 'La vio' : 'La ve ya';
  }
  if (week.held) return 'Retenida: no se publica sola';
  if (week.opens_on) {
    return week.opens_on <= today ? 'Se publica sola hoy' : `Se publica sola el ${weekdayDate(week.opens_on)}`;
  }
  return 'Oculta hasta que la publiques';
}

/** Lo que recibe un atleta, en una línea. */
export function athleteLine(a: AssignPreviewAthlete): string {
  switch (a.action) {
    case 'blocked':
      return a.blocked?.message ?? 'No se le puede asignar';
    case 'skip':
      return a.conflict
        ? `Sigue con «${a.conflict.program_name}» hasta el ${weekdayDate(a.conflict.end_date)}`
        : 'Se queda como está';
    case 'adopt':
      return a.program ? `Ya hace «${a.program.name}»` : 'Ya hace un programa del grupo';
    case 'chain':
      return a.start_date
        ? `Tras «${a.conflict?.program_name ?? 'su programa'}» · ${dateRange(a.start_date, a.end_date ?? a.start_date)}`
        : 'Detrás de lo que tiene';
    case 'replace':
      return a.conflict
        ? `Corta «${a.conflict.program_name}» · ${a.start_date ? dateRange(a.start_date, a.end_date ?? a.start_date) : ''}`
        : 'Sustituye lo que tiene';
    case 'assign':
    default:
      return a.start_date ? dateRange(a.start_date, a.end_date ?? a.start_date) : 'Desde la fecha elegida';
  }
}

/** Cuántos RECIBEN algo (los que cuenta el botón «Asignar a N»). */
export function receivingCount(p: Pick<AssignPreview, 'counts'>): number {
  return p.counts.assign + p.counts.chain + p.counts.replace;
}

/** La línea bajo «Entrega» en Asignar programa. */
export function deliveryLine(d: WeekDelivery, days: number | null): string {
  if (d === 'visible') return 'Ve todas las semanas desde ya.';
  if (d === 'draft') return 'Ocultas hasta que las publiques tú.';
  if (days == null) return 'Cada semana se publica sola unos días antes de empezar.';
  if (days === 0) return 'Cada semana se publica sola el mismo lunes.';
  // Lunes − N: el día de la semana en que se abre (con un lunes cualquiera de referencia).
  const ref = new Date(Date.UTC(2026, 0, 5 - days));
  const day = weekdayShort(ref.toISOString().slice(0, 10));
  return `Cada semana se publica sola ${days} ${days === 1 ? 'día' : 'días'} antes (el ${day}).`;
}

/** «2 de 3 debidas» de la semana: días pasados (y hoy si ya está hecho) con entreno. */
export function weekDueSummary(
  days: ReadonlyArray<Pick<PeekDay, 'date' | 'state'>>,
  today: string,
): { due: number; done: number } {
  let due = 0;
  let done = 0;
  for (const d of days) {
    if (d.state === 'rest') continue;
    if (d.date < today || (d.date === today && d.state === 'done')) {
      if (d.state === 'pending') continue; // oculta: no podía verla
      due += 1;
      if (d.state === 'done') done += 1;
    }
  }
  return { due, done };
}
