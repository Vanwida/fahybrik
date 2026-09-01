// Chip de entrega de la SEMANA CALENDARIO del atleta.
//
// Dos ejes, una frase. Eje A = existencia (¿hay mes? ¿hay sesiones esta
// semana? ¿el último mes ya cerró?). Eje B = visibilidad, la misma puerta
// que el MCP (`athlete_sees_it` / `weekly_plans.status='draft'`): sin fila
// se VE; solo un draft explícito esconde.
//
// No es `programming_status` (eso cuenta assignments sin filtrar draft y
// por eso un borrador lleno salía «Plan OK»). No es un tercer status de
// publicación. El coach lee este chip en lista, ficha y semana.

export type AthleteWeekChipKind =
  | 'visible'
  | 'no_lo_ve'
  | 'semana_vacia'
  | 'bloque_terminado'
  | 'sin_plan';

export type AthleteWeekChip = {
  kind: AthleteWeekChipKind;
  label: string;
};

export type AthleteWeekChipInput = {
  has_month_assignment: boolean;
  /** YYYY-MM-DD del `max(end_date)` de `athlete_month_assignments`. */
  last_assignment_end: string | null;
  session_count_this_week: number;
  /** `visibilityOf(...).athlete_sees_it` — false solo si la semana es draft. */
  athlete_sees_it: boolean;
  /** YYYY-MM-DD del día de caja contra el que se juzga el bloque. */
  today: string;
};

export const ATHLETE_WEEK_CHIP_LABEL: Record<AthleteWeekChipKind, string> = {
  visible: 'Visible',
  no_lo_ve: 'No lo ve',
  semana_vacia: 'Semana vacía',
  bloque_terminado: 'Bloque terminado',
  sin_plan: 'Sin plan',
};

/** Chip de fallback cuando falta el mapa (sin recibo). */
export const SIN_PLAN_CHIP: AthleteWeekChip = {
  kind: 'sin_plan',
  label: ATHLETE_WEEK_CHIP_LABEL.sin_plan,
};

/**
 * Misma puerta que el MCP (`athlete_sees_it`) y que el móvil
 * (`NOT EXISTS weekly_plans.status='draft'`). Sin fila se ve.
 */
export function athleteSeesItFromWeeklyStatus(
  status: string | null | undefined,
): boolean {
  return status !== 'draft';
}

function of(kind: AthleteWeekChipKind): AthleteWeekChip {
  return { kind, label: ATHLETE_WEEK_CHIP_LABEL[kind] };
}

/**
 * Un solo chip. Prioridad: sin plan → si hay sesiones, visibilidad → si no,
 * bloque terminado vs semana vacía. Un draft vacío no es «No lo ve»: no hay
 * nada que esconder.
 */
export function athleteWeekChip(input: AthleteWeekChipInput): AthleteWeekChip {
  if (!input.has_month_assignment) return of('sin_plan');

  if (input.session_count_this_week > 0) {
    return input.athlete_sees_it ? of('visible') : of('no_lo_ve');
  }

  if (input.last_assignment_end != null && input.last_assignment_end < input.today) {
    return of('bloque_terminado');
  }

  return of('semana_vacia');
}

/** True solo cuando el atleta ve sesiones esta semana. El roster usa esto
 *  para `week_ok` — un draft lleno no es Plan OK. */
export function weekIsDelivered(kind: AthleteWeekChipKind): boolean {
  return kind === 'visible';
}
