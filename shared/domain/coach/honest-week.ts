// La semana que Resumen y Plan titulan es la SEMANA CALENDARIO del chip.
// Un bloque acabado no se llama «Esta semana». Una semana sin sesiones no
// se pinta como 7×Descanso ni se lee como frescura.
//
// Recorrido 18-ago: Marc (Resumen 13–19 jul bajo «Esta semana») y Guillem
// (7 descansos + frescura sobre 0 km). Misma puerta que athleteWeekChip.

import { isoDateString, mondayOfWeek, parseIsoDate } from '../dates';
import {
  ATHLETE_WEEK_CHIP_LABEL,
  type AthleteWeekChip,
  type AthleteWeekChipKind,
} from './athlete-week-chip';

export type WeekLike = {
  week_start: string;
  week_end: string;
  days: Array<{ is_today: boolean; sessions: unknown[] }>;
};

export type HonestWeekHeading = {
  title: string;
  week_start: string;
  week_end: string;
  paint_days: boolean;
  empty_copy: string | null;
};

export type PlanWeekRelation = 'none' | 'ended' | 'not_started' | 'empty' | 'running';

/** Nunca `weeks[0]`. Si el lunes de caja no está, no hay semana que pintar. */
export function pickCalendarWeek<T extends { week_start: string }>(
  weeks: readonly T[],
  calendarMonday: string,
): T | null {
  return weeks.find((w) => w.week_start === calendarMonday) ?? null;
}

function daysHaveSessions(week: WeekLike): boolean {
  return week.days.some((d) => d.sessions.length > 0);
}

/**
 * Visible y No lo ve hay trabajo esta semana (se pinta). El resto es
 * ausencia: no se finge un microciclo de descansos.
 */
export function weekHasSessions(kind: AthleteWeekChipKind): boolean {
  return kind === 'visible' || kind === 'no_lo_ve';
}

export function honestWeekHeading(args: {
  chip: AthleteWeekChip;
  calendarMonday: string;
  calendarSunday: string;
}): HonestWeekHeading {
  const paint = weekHasSessions(args.chip.kind);
  const title = paint ? 'Esta semana' : ATHLETE_WEEK_CHIP_LABEL[args.chip.kind];
  return {
    title,
    week_start: args.calendarMonday,
    week_end: args.calendarSunday,
    paint_days: paint,
    empty_copy: paint ? null : title,
  };
}

/**
 * Relación del lienzo con el hoy de caja. Un payload de julio con el chip
 * `bloque_terminado` es `ended`, nunca `not_started`.
 */
export function planWeekRelation(args: {
  chipKind: AthleteWeekChipKind;
  weeks: readonly WeekLike[];
  today: string;
}): PlanWeekRelation {
  if (args.chipKind === 'sin_plan') return 'none';
  if (args.chipKind === 'bloque_terminado') return 'ended';

  const monday = isoDateString(mondayOfWeek(parseIsoDate(args.today)));
  const calendar = pickCalendarWeek(args.weeks, monday);
  if (calendar) return daysHaveSessions(calendar) ? 'running' : 'empty';

  const firstStart = args.weeks[0]?.week_start;
  if (firstStart != null && firstStart > args.today) return 'not_started';
  // Chip no es bloque_terminado: el plan sigue en marcha. La semana de caja
  // no está en el lienzo (hueco o ancla de mes). No se lee como acabado.
  return 'empty';
}

export function initialPlanWeekIndex(
  weeks: readonly WeekLike[],
  relation: PlanWeekRelation,
): number {
  const todayIdx = weeks.findIndex((w) => w.days.some((d) => d.is_today));
  if (todayIdx >= 0) return todayIdx;
  if (relation === 'ended' && weeks.length > 0) return weeks.length - 1;
  return 0;
}

/** Frase del encabezado de Plan. El chip ya cubre vacío / sin plan. */
export function planRelationCopy(
  relation: PlanWeekRelation,
  startLabel: string | null,
): string | null {
  if (relation === 'ended') return 'Bloque terminado';
  if (relation === 'not_started' && startLabel) {
    return `Aún no ha arrancado · empieza el ${startLabel}`;
  }
  return null;
}

/**
 * El motor de carga puede tener TSB. Sin sesiones esta semana ese número
 * no es un veredicto de frescura — 0 km no es «fresco».
 */
export function allowsFreshnessVerdict(
  engineAllows: boolean,
  kind: AthleteWeekChipKind,
): boolean {
  return engineAllows && weekHasSessions(kind);
}
