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

import { GRADIENT_RETIRES_PACE_PCT } from '../running/gradient';

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

  // ── ¿Estoy mejorando? — los umbrales de la lectura del ATLETA ──────────────
  // Misma fila y mismo coach: son juicios sobre CARRERA, y partirlos en una
  // segunda tabla habría obligado a resolver dos filas para la misma pregunta.
  // `min_pairs_for_compromised_trend` ya de arriba sirve a las dos lecturas sin
  // duplicarse: es el mismo umbral sobre la misma curva.

  /** Semanas de historial antes de atreverse a afirmar una tendencia. Por
   *  debajo, el veredicto dice «aún no» y dibuja el plazo. */
  min_weeks_to_judge: number;
  /** Segundos por kilómetro a partir de los cuales un cambio deja de ser
   *  ruido y pasa a ser mejora (o empeoramiento). */
  meaningful_gain_s_per_km: number;
  /** Subida de volumen (proporción: 0,2 = +20 %) que, CRUZADA con el ritmo
   *  empeorando, hace saltar «cargando de más». Sola no juzga nada. */
  volume_surge_ratio: number;
  /** A partir de qué porcentaje de repeticiones en banda se considera que el
   *  atleta clava lo que le piden. */
  good_in_band_pct: number;
  /** Repeticiones evaluadas mínimas antes de JUZGAR ese porcentaje. Por
   *  debajo la cifra se enseña sin color: existe, pero no concluye. */
  min_reps_to_judge_band: number;
  /** Qué zona ancla el «ritmo al mismo pulso». Por defecto la aeróbica suave,
   *  que es donde un atleta acumula horas comparables semana a semana; hay
   *  quien prefiere anclar en umbral. */
  same_hr_reference_zone: number;
  /** Media banda alrededor del pulso de referencia, en latidos. Fuera de ella
   *  el tramo se descarta en vez de extrapolarse. */
  same_hr_tolerance_bpm: number;
  /** Metros mínimos de un tramo para que su pulso medio signifique algo: en
   *  una serie corta el corazón todavía va subiendo cuando ya se acabó. */
  same_hr_min_distance_m: number;
  /**
   * Pendiente (%) a partir de la cual el ritmo deja de compararse: en cuesta
   * un ritmo bruto no significa nada. En valor absoluto — una bajada del 6 %
   * infla el ritmo tanto como una subida lo hunde.
   *
   * Viaja al cliente dentro de `run_compliance` para que el móvil deje de
   * tener su propia constante. Ver `shared/domain/running/gradient.ts`.
   */
  gradient_retires_pace_pct: number;
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
export const RUNNING_THRESHOLD_MIN_WEEKS_MIN = 2;
export const RUNNING_THRESHOLD_MIN_WEEKS_MAX = 52;
export const RUNNING_THRESHOLD_MEANINGFUL_GAIN_MIN = 1;
export const RUNNING_THRESHOLD_MEANINGFUL_GAIN_MAX = 60;
export const RUNNING_THRESHOLD_VOLUME_SURGE_MIN = 0.05;
export const RUNNING_THRESHOLD_VOLUME_SURGE_MAX = 2;
export const RUNNING_THRESHOLD_GOOD_IN_BAND_MIN = 50;
export const RUNNING_THRESHOLD_GOOD_IN_BAND_MAX = 100;
export const RUNNING_THRESHOLD_MIN_REPS_TO_JUDGE_MIN = 3;
export const RUNNING_THRESHOLD_MIN_REPS_TO_JUDGE_MAX = 200;
/**
 * Dónde puede anclarse el «ritmo al mismo pulso». Z2 a Z5 — la Z1 queda fuera, y
 * NO por una opinión de entrenamiento: la Z1 no tiene suelo por definición del
 * modelo de zonas (`resolveHrZones` le pone `min_bpm: null`, porque no hay un
 * suelo para ir suave), así que no existe un punto medio del que sacar una
 * referencia. Es aritmética, no método.
 *
 * Importa que esté acotado AQUÍ y en la tabla: sin este límite, un coach que
 * anclara en Z1 dejaba la serie vacía y la pantalla le decía al atleta «te
 * faltan semanas de historia» — culpando al atleta de una elección del coach,
 * que es la peor forma de fallar que tiene esta pantalla.
 */
export const RUNNING_THRESHOLD_REFERENCE_ZONE_MIN = 2;
export const RUNNING_THRESHOLD_REFERENCE_ZONE_MAX = 5;
export const RUNNING_THRESHOLD_SAME_HR_TOLERANCE_MIN = 2;
export const RUNNING_THRESHOLD_SAME_HR_TOLERANCE_MAX = 15;
export const RUNNING_THRESHOLD_SAME_HR_MIN_DISTANCE_MIN = 400;
export const RUNNING_THRESHOLD_SAME_HR_MIN_DISTANCE_MAX = 10000;
/** Por debajo del 1 % es ruido de medición; por encima del 15 % es una pared,
 *  y un umbral que no retira nada da igual que no existir. */
export const RUNNING_THRESHOLD_GRADIENT_RETIRES_MIN = 1;
export const RUNNING_THRESHOLD_GRADIENT_RETIRES_MAX = 15;

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
 *
 * Y los de «¿estoy mejorando?» (maqueta `analiticas-correr`, aprobada 12-ago):
 *
 *   - 6 semanas para afirmar una tendencia: por debajo, una racha buena y una
 *     mejora de forma se ven exactamente igual.
 *   - 3 s/km de cambio mínimo: por debajo entra el ruido de medir en la calle
 *     (viento, GPS, un semáforo) y la señal no se distingue de él.
 *   - +20 % de volumen para el aviso de exceso: es el clásico salto de
 *     escalón, y solo avisa si ADEMÁS el motor responde peor.
 *   - 80 % en banda: el estándar de "clava lo que le piden" del sector.
 *   - 15 repeticiones antes de juzgar ese 80 %: con cinco, fallar una lo
 *     mueve veinte puntos.
 *   - Zona 2 de referencia: donde se acumulan horas comparables semana a
 *     semana. ±5 ppm de tolerancia: la ventana más ancha en la que corregir
 *     el ritmo por el pulso sigue siendo honesto sin extrapolar. 1000 m
 *     mínimos: por debajo, el pulso medio va por detrás del esfuerzo.
 */
export const DEFAULT_COACH_RUNNING_THRESHOLDS: CoachRunningThresholds = {
  min_reps_per_position: 3,
  min_series_for_calibration: 20,
  freshness_alert_tsb: -8,
  min_pairs_for_compromised_trend: 4,
  min_weeks_to_judge: 6,
  meaningful_gain_s_per_km: 3,
  volume_surge_ratio: 0.2,
  good_in_band_pct: 80,
  min_reps_to_judge_band: 15,
  same_hr_reference_zone: 2,
  same_hr_tolerance_bpm: 5,
  same_hr_min_distance_m: 1000,
  // El mismo 3 % que la app ya aplicaba por su cuenta: un coach que no toca
  // nada ve exactamente el comportamiento de hoy.
  gradient_retires_pace_pct: GRADIENT_RETIRES_PACE_PCT,
};

/** Los defectos, en copia fresca (quien llama puede esparcir y mutar). */
export function defaultCoachRunningThresholds(): CoachRunningThresholds {
  return { ...DEFAULT_COACH_RUNNING_THRESHOLDS };
}

/** Las claves editables, para recorrerlas sin repetir la lista a mano. */
export const COACH_RUNNING_THRESHOLD_KEYS = Object.keys(
  DEFAULT_COACH_RUNNING_THRESHOLDS,
) as Array<keyof CoachRunningThresholds>;
