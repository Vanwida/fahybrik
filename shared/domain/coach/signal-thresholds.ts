// @fahybrid/shared/domain/coach/signal-thresholds — los umbrales de señal (y las
// bandas de readiness) que el COACH edita.
//
// POR QUÉ EXISTE ESTE FICHERO (HARD RULE Nº0: mecanismo vs método)
// ---------------------------------------------------------------
// Que exista una señal «readiness bajo» o «pregunta sin responder» es MECANISMO:
// lo decide el modelo (una lectura muy baja, o una caída sostenida frente a la
// base propia del atleta; una pregunta se cierra respondiendo). CUÁNTO tiene que
// caer, cuántos días seguidos, cuántas horas de espera antes de molestar al coach
// es MÉTODO: un entrenador con veinte atletas quiere saberlo al día siguiente y
// otro con cien no quiere ruido hasta la semana. La pregunta que decide («¿otro
// entrenador competente lo haría distinto?») da que sí, así que estos números
// nacen como DATO con un valor por defecto, nunca como `const`.
//
// UNA TABLA (`COACH_THRESHOLD_SPEC`) dice, por clave, el defecto, los límites y la
// unidad. De ella salen: los defectos que sirve el resolutor
// (`web/lib/coach/signal-thresholds.ts`), el esquema del PUT
// (`shared/schema/coach-signal-thresholds.ts`), los CHECK de la tabla
// (`coach_signal_thresholds`, migs 0161 y 0211) y los pasos de la pantalla
// Ajustes › Método (components/v2/ajustes/ThresholdsSettings). Añadir un umbral = una entrada aquí + una columna.
//
// NULL en la fila del coach = «usa el defecto». Un coach que no toca nada se
// comporta exactamente como el sistema.
//
// Puro y sin base de datos, como el resto de `shared/domain`.

/** Cómo se dice la unidad en la pantalla (la pantalla pone la palabra). */
export type ThresholdUnit = 'dias' | 'horas' | 'puntos' | 'checkins' | 'entrenos' | 'rpe' | 'pct';

/** Para agrupar en la pantalla de Método sin repetir la lista a mano. */
export type ThresholdGroup = 'readiness' | 'sesiones' | 'mensajes' | 'comunicados' | 'revisiones' | 'cobros';

export interface ThresholdSpec {
  default: number;
  min: number;
  max: number;
  unit: ThresholdUnit;
  group: ThresholdGroup;
}

/**
 * La tabla única de umbrales editables. Genéricos y sin nombre propio: son el
 * punto de partida más común, nunca los números de una metodología concreta.
 *
 * Readiness (0–100, la puntuación compuesta del atleta):
 *   - Bandas 67 / 45: «bien» desde 67, «cautela» 45–66, «bajo» por debajo. Solo
 *     PINTAN el número; no disparan nada por sí mismas.
 *   - Suelo crítico 40: una sola lectura por debajo es «actúa hoy», sin mirar la
 *     base. Es el mismo número que la banda de riesgo del check-in (DECISIONS
 *     2026-07-27, «una sola banda de riesgo»), para que la app que adapta la
 *     sesión y el coach que recibe el aviso hablen de lo mismo.
 *   - Caída 15 puntos bajo SU mediana de 28 días durante 3 días seguidos: la
 *     señal de tendencia (SPEC §8 «tendencia, no foto»). Un 52 en alguien cuya
 *     base es 75 importa; un 44 en alguien cuya base es 46 no.
 *   - Frescura 2 días: una lectura de hace tres semanas no describe hoy.
 * Sesiones:
 *   - 2 entrenos debidos sin hacer en 7 días (solo lo que ya tocaba y el atleta
 *     podía ver — un día de descanso no es un entreno perdido).
 *   - RPE ≥ 9 en la mitad o más de los entrenos de la semana (mínimo dos): un
 *     entreno duro a la semana es el plan funcionando; la mitad al límite es
 *     sobrecarga.
 * Check-in:
 *   - Solo avisa a quien tiene el hábito (10 de los 14 días previos) y lo rompe
 *     2 días. A quien no lo hace nunca, no se le echa en falta.
 * Mensajes: 12 horas esperando respuesta para subir a Hoy.
 * Comunicados (0161): 2 días sin responder una pregunta, 3 de retraso para que
 *   una tarea pase a crítica, 3 de antelación para un protocolo sin abrir.
 * Entrenos sin hacer (0243): además del mínimo, una parte de lo debido (30 %):
 *   2 de 10 es una semana normal; 2 de 4 no.
 * Revisiones 1:1 (0242): 14 días antes de volver a proponer una revisión al mismo
 *   atleta que no reservó la anterior.
 * Bajas (0244): quien canceló y se va en 7 días o menos pasa a Vigilar («Se da de
 *   baja en N d»), para que el coach le escriba antes de que termine.
 */
export const COACH_THRESHOLD_SPEC = {
  readiness_ok_min: { default: 67, min: 1, max: 100, unit: 'puntos', group: 'readiness' },
  readiness_caution_min: { default: 45, min: 0, max: 99, unit: 'puntos', group: 'readiness' },
  readiness_critical_floor: { default: 40, min: 0, max: 99, unit: 'puntos', group: 'readiness' },
  readiness_drop_points: { default: 15, min: 3, max: 50, unit: 'puntos', group: 'readiness' },
  readiness_drop_days: { default: 3, min: 1, max: 14, unit: 'dias', group: 'readiness' },
  readiness_max_age_days: { default: 2, min: 0, max: 14, unit: 'dias', group: 'readiness' },
  checkin_habit_min: { default: 10, min: 1, max: 14, unit: 'checkins', group: 'readiness' },
  checkin_skipped_days: { default: 2, min: 1, max: 14, unit: 'dias', group: 'readiness' },
  missed_sessions_min: { default: 2, min: 1, max: 14, unit: 'entrenos', group: 'sesiones' },
  missed_sessions_share_pct: { default: 30, min: 0, max: 100, unit: 'pct', group: 'sesiones' },
  rpe_high_min: { default: 9, min: 6, max: 10, unit: 'rpe', group: 'sesiones' },
  rpe_high_share_pct: { default: 50, min: 10, max: 100, unit: 'pct', group: 'sesiones' },
  message_unanswered_hours: { default: 12, min: 1, max: 168, unit: 'horas', group: 'mensajes' },
  communication_question_unanswered_days: {
    default: 2,
    min: 1,
    max: 30,
    unit: 'dias',
    group: 'comunicados',
  },
  communication_task_overdue_critical_days: {
    default: 3,
    min: 1,
    max: 30,
    unit: 'dias',
    group: 'comunicados',
  },
  communication_protocol_unopened_days: {
    default: 3,
    min: 1,
    max: 30,
    unit: 'dias',
    group: 'comunicados',
  },
  review_reproposal_days: { default: 14, min: 1, max: 90, unit: 'dias', group: 'revisiones' },
  renewal_alert_days: { default: 7, min: 1, max: 60, unit: 'dias', group: 'cobros' },
} as const satisfies Record<string, ThresholdSpec>;

export type CoachThresholdKey = keyof typeof COACH_THRESHOLD_SPEC;

/** Los valores efectivos, uno por clave. */
export type CoachThresholds = Record<CoachThresholdKey, number>;

/** Las claves editables en el orden de la tabla (el de la pantalla). */
export const COACH_THRESHOLD_KEYS = Object.keys(COACH_THRESHOLD_SPEC) as CoachThresholdKey[];

/** Los defectos del sistema, una entrada por clave. */
export const DEFAULT_COACH_THRESHOLDS: CoachThresholds = Object.fromEntries(
  COACH_THRESHOLD_KEYS.map((k) => [k, COACH_THRESHOLD_SPEC[k].default]),
) as CoachThresholds;

/** Copia fresca de los defectos (quien llama puede esparcir y mutar). */
export function defaultCoachThresholds(): CoachThresholds {
  return { ...DEFAULT_COACH_THRESHOLDS };
}

/** Una fila del coach: cada clave es su número o null (= el defecto). */
export type CoachThresholdOverrides = Partial<Record<CoachThresholdKey, number | null>>;

/** Los efectivos: el defecto de cada clave con el número del coach encima. */
export function mergeCoachThresholds(overrides: CoachThresholdOverrides | null): CoachThresholds {
  const out = defaultCoachThresholds();
  if (!overrides) return out;
  for (const k of COACH_THRESHOLD_KEYS) {
    const v = overrides[k];
    if (v != null) out[k] = v;
  }
  return out;
}

/** Una incoherencia entre umbrales que el PUT tiene que rechazar. */
export interface ThresholdIssue {
  key: CoachThresholdKey;
  message: string;
}

/**
 * Coherencia entre columnas, sobre los valores EFECTIVOS (en la fila una columna
 * nula es el defecto, así que no se puede comprobar en un CHECK de tabla).
 *   - La banda de cautela empieza por debajo de la de «bien».
 *   - El suelo crítico no puede estar por encima de la banda «bien»: sería
 *     avisar de urgencia de un número que la misma pantalla pinta en verde.
 */
export function thresholdIssues(t: CoachThresholds): ThresholdIssue[] {
  const issues: ThresholdIssue[] = [];
  if (t.readiness_caution_min >= t.readiness_ok_min) {
    issues.push({
      key: 'readiness_caution_min',
      message: 'La banda de cautela tiene que empezar por debajo de la de «bien».',
    });
  }
  if (t.readiness_critical_floor >= t.readiness_ok_min) {
    issues.push({
      key: 'readiness_critical_floor',
      message: 'El suelo crítico tiene que estar por debajo de la banda de «bien».',
    });
  }
  return issues;
}

// ── Readiness: bandas (pintan) ───────────────────────────────────────────────

export type ReadinessBand = 'ok' | 'caution' | 'low';

/** La banda de un valor con las bandas del coach (o las del sistema). */
export function readinessBandOf(
  score: number,
  t: Pick<CoachThresholds, 'readiness_ok_min' | 'readiness_caution_min'> = DEFAULT_COACH_THRESHOLDS,
): ReadinessBand {
  if (score >= t.readiness_ok_min) return 'ok';
  if (score >= t.readiness_caution_min) return 'caution';
  return 'low';
}
