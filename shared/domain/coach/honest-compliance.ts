// Cumplimiento semanal: un número solo si el denominador ES la semana
// calendario visible. Un draft, un bloque acabado o la semana de otro
// mes no son 0 % — no hay semana que contar.
//
// Recorrido 18-ago «Vacío que miente»: Marc con hechas + RPE y el panel
// al 0 %. #34 ya evita week_ok en un draft; aquí no se pinta el %.

import { adherencePct } from '../adherence/completion';
import type { AthleteWeekChipKind } from './athlete-week-chip';

export const SIN_SEMANA_QUE_CONTAR = 'sin semana que contar';

export type WeekComplianceRead =
  | { kind: 'pct'; pct: number }
  | { kind: 'empty'; label: typeof SIN_SEMANA_QUE_CONTAR };

/** Solo una semana Visible es denominador. Draft / vacía / acabada / sin plan no. */
export function weekCanCountCompliance(kind: AthleteWeekChipKind): boolean {
  return kind === 'visible';
}

/**
 * `adherencePct` sobre un denominador que no es esta semana visible
 * inventa un 0 %. Aquí eso es vacío, nunca un porcentaje.
 */
export function weekComplianceRead(input: {
  chipKind: AthleteWeekChipKind;
  scheduled: number;
  completed: number;
}): WeekComplianceRead {
  if (!weekCanCountCompliance(input.chipKind)) {
    return { kind: 'empty', label: SIN_SEMANA_QUE_CONTAR };
  }
  const pct = adherencePct(input.scheduled, input.completed);
  if (pct == null) return { kind: 'empty', label: SIN_SEMANA_QUE_CONTAR };
  return { kind: 'pct', pct };
}

export function weekCompliancePct(
  chipKind: AthleteWeekChipKind,
  scheduled: number,
  completed: number,
): number | null {
  const read = weekComplianceRead({ chipKind, scheduled, completed });
  return read.kind === 'pct' ? read.pct : null;
}
