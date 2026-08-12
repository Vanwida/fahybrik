// @fahybrid/shared/domain/coach/running-thresholds — los umbrales de los
// agregados de carrera (#71, mockup carrera-en-el-panel.html §08) que el
// COACH edita.
//
// POR QUÉ EXISTE ESTE FICHERO (HARD RULE Nº0: mecanismo vs método)
// ---------------------------------------------------------------
// Que una posición con pocas repeticiones se dibuje sin porcentaje es
// MECANISMO: lo decide el modelo (un 0 % sostenido por dos observaciones es
// una conclusión inventada). CUÁNTAS repeticiones hacen falta, cuántas
// series para juzgar la calibración entera, y a partir de qué frescura la
// carga dispara un aviso, es MÉTODO: la pregunta que decide («¿otro
// entrenador competente lo haría distinto?») da que sí para las tres, así
// que nacen como DATO con un valor por defecto, nunca como `const`.
//
// El resolutor (`web/lib/coach/running-thresholds.ts`) mezcla la fila del
// coach sobre estos defectos y entrega el conjunto vigente — mismo patrón
// que `signal-thresholds.ts`.
//
// Puro y sin base de datos, como el resto de `shared/domain`.

/**
 * Una fila por coach (`coach_running_thresholds`, único por `coach_id`).
 * Todos los campos son obligatorios: guardar reemplaza el conjunto entero,
 * sin parche por campo.
 */
export interface CoachRunningThresholds {
  /** Repeticiones evaluables mínimas en UNA posición de la serie para
   *  ponerle porcentaje a esa columna del desglose de calibración. */
  min_reps_per_position: number;
  /** Series evaluables mínimas (repeticiones de trabajo con ritmo objetivo)
   *  para que la tarjeta de calibración entera dé un porcentaje. */
  min_series_for_calibration: number;
  /** TSB igual o por debajo del cual el panel de carga dice "está
   *  apretando". Negativo por naturaleza. */
  freshness_alert_tsb: number;
  /** Comparaciones (semana × banda, con fresco Y fatigado) mínimas para que
   *  la curva de "carrera comprometida" se dé por buena — ver
   *  `shared/domain/running/compromised-pace.ts`. */
  min_pairs_for_compromised_trend: number;
}

// ── Límites (con nombre, no mágicos — se repiten como CHECKs en la tabla) ─────

export const RUNNING_THRESHOLD_MIN_REPS_PER_POSITION_MIN = 2;
export const RUNNING_THRESHOLD_MIN_REPS_PER_POSITION_MAX = 20;
export const RUNNING_THRESHOLD_MIN_SERIES_MIN = 5;
export const RUNNING_THRESHOLD_MIN_SERIES_MAX = 200;
export const RUNNING_THRESHOLD_FRESHNESS_ALERT_MIN = -50;
export const RUNNING_THRESHOLD_FRESHNESS_ALERT_MAX = 0;
export const RUNNING_THRESHOLD_MIN_PAIRS_MIN = 2;
export const RUNNING_THRESHOLD_MIN_PAIRS_MAX = 50;

/**
 * Los defectos del sistema, servidos mientras el coach no haya escrito su
 * fila — los mismos números que las maquetas aprobadas (mockup §05/§06/§08):
 *
 *   - 3 repeticiones mínimas por posición: con dos, cualquier resultado es
 *     0 % o 100 %, ninguno informativo.
 *   - 20 series mínimas para calibración: por debajo, "cuántas lleva" dice
 *     más que un porcentaje sobre una muestra corta.
 *   - −8 de frescura para el aviso: más exigente que el "cargado" general
 *     (−10, `athlete-deep-dive.ts`) porque ésta es una alerta específica de
 *     carrera, pensada para avisar antes de que el "cargado" general salte.
 *   - 4 comparaciones mínimas para la curva de correr cansado: con menos,
 *     una mejora real y el ruido de dos sesiones sueltas se leen igual.
 */
export const DEFAULT_COACH_RUNNING_THRESHOLDS: CoachRunningThresholds = {
  min_reps_per_position: 3,
  min_series_for_calibration: 20,
  freshness_alert_tsb: -8,
  min_pairs_for_compromised_trend: 4,
};

/** Los defectos, en copia fresca (quien llama puede esparcir y mutar). */
export function defaultCoachRunningThresholds(): CoachRunningThresholds {
  return { ...DEFAULT_COACH_RUNNING_THRESHOLDS };
}

/** Las claves editables, para recorrerlas sin repetir la lista a mano. */
export const COACH_RUNNING_THRESHOLD_KEYS = Object.keys(
  DEFAULT_COACH_RUNNING_THRESHOLDS,
) as Array<keyof CoachRunningThresholds>;
