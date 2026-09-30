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
export type ThresholdUnit =
  | 'dias'
  | 'horas'
  | 'puntos'
  | 'checkins'
  | 'entrenos'
  | 'rpe'
  | 'pct'
  | 'peso'
  | 'escala10'
  // La muñeca (0282): lo que se mide y las dos formas de elegir.
  | 'segundos'
  | 'metros'
  | 'minutos'
  | 'km'
  | 'latidos'
  | 'vatios'
  | 'pasos'
  /** 0 = no, 1 = sí: un interruptor. */
  | 'si_no'
  /** Un valor de una lista corta: el número es la posición (las palabras, en la pantalla). */
  | 'sentido';

/** Para agrupar en la pantalla de Método sin repetir la lista a mano. */
export type ThresholdGroup =
  | 'readiness'
  | 'sesiones'
  | 'mensajes'
  | 'comunicados'
  | 'revisiones'
  | 'cobros'
  | 'calculo_readiness'
  | 'disposicion'
  | 'progresion'
  | 'pausas'
  | 'alta'
  | 'muneca_avisos'
  | 'muneca_pasos'
  | 'muneca_correr'
  | 'muneca_cierre';

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
 *
 * Motores secundarios (0256) — lo que era `const` en código y es método:
 *   - Cálculo del readiness: cuánto pesa cada parte (check-in 35 · VFC 25 · sueño
 *     20 · FC en reposo 10 · recuperación 10), las horas de sueño que puntúan
 *     entero (8) y el castigo de 5 puntos cuando la adherencia de 7 días baja
 *     del 60 %. Los pesos son RELATIVOS: el motor los normaliza (suman 1 por
 *     construcción) y reparte entre las partes que hay ese día.
 *   - Índice de disposición (roster, ficha, MCP): frescura 40 · adherencia 30 ·
 *     VFC 20 · actividad 10, también relativos y normalizados a 100; la frescura
 *     va de 0 con TSB −10 a entera con +10. Una banda con peso 0 no cuenta ni se
 *     echa en falta.
 *   - «Listo para progresar»: adherencia ≥ 75 %, sobrecarga con ACWR > 150 % o
 *     TSB < −25, infraentrenado con ACWR < 50 %, retroceso en tests > 2 %.
 *   - Pausa: 28 días por año móvil.
 *   - Alta: avisa si llega con sueño ≤ 4/10 o estrés ≥ 7/10.
 * Magnitudes siempre positivas (el TSB «−25» se guarda 25): la pantalla no pide
 * signos ni decimales.
 *
 * La muñeca al correr (0282, `wrist_*`) — método del coach, no mecanismo del reloj:
 *   - Avisos: la holgura por eje antes de contar como «fuera» (ritmo 3 s/km, pulso
 *     2 ppm, 2 s/500 m, 10 W, 3 pasos/min), cada cuánto puede volver a avisar (20 s),
 *     cuántos segundos seguidos fuera antes del primero (4 s), la gracia al entrar
 *     en un paso a zona (45 s: el pulso va con retraso), si avisa en el calentamiento
 *     y en la recuperación (no), y hacia dónde avisa un rodaje a zona cuando el tramo
 *     no lo dice (`wrist_alert_continuous_zone`: 0 nunca, 1 solo por arriba, 2 los dos
 *     sentidos; defecto 1, «el tope solo avisa por encima»).
 *   - Preaviso del final de un paso (10 s o 100 m) y el paso más corto que lo lleva (30 s).
 *   - Vuelta automática cada N metros (1000; 0 = apagada) y en qué clases de sesión
 *     (rodaje y tirada), dónde empieza una tirada (75′ o 16 km) y hasta dónde llega
 *     un stride (30″), y si de calentar a las series se pasa solo o hasta pulsar.
 *   - Al terminar: qué fracción de una serie cortada a mano cuenta como hecha (90 %) y
 *     tras cuántos minutos quieto se guarda sola una sesión que ya acabó (10).
 *   Lo que sigue siendo MECANISMO y no está aquí: el techo de 20:00/km, los 10 m
 *   mínimos para dar ritmo, la ventana de 10 s, los 5 s para deshacer y el
 *   Always-On. Las palabras del RPE (`wrist_rpe_words`, 11 textos) no caben en un
 *   número: viven en `wrist-method.ts`.
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
  readiness_weight_checkin: { default: 35, min: 0, max: 100, unit: 'peso', group: 'calculo_readiness' },
  readiness_weight_hrv: { default: 25, min: 0, max: 100, unit: 'peso', group: 'calculo_readiness' },
  readiness_weight_sleep: { default: 20, min: 0, max: 100, unit: 'peso', group: 'calculo_readiness' },
  readiness_weight_rhr: { default: 10, min: 0, max: 100, unit: 'peso', group: 'calculo_readiness' },
  readiness_weight_recovery: { default: 10, min: 0, max: 100, unit: 'peso', group: 'calculo_readiness' },
  readiness_sleep_target_hours: { default: 8, min: 5, max: 12, unit: 'horas', group: 'calculo_readiness' },
  readiness_adherence_floor_pct: { default: 60, min: 0, max: 100, unit: 'pct', group: 'calculo_readiness' },
  readiness_adherence_penalty: { default: 5, min: 0, max: 30, unit: 'puntos', group: 'calculo_readiness' },
  race_readiness_weight_freshness: { default: 40, min: 0, max: 100, unit: 'peso', group: 'disposicion' },
  race_readiness_weight_adherence: { default: 30, min: 0, max: 100, unit: 'peso', group: 'disposicion' },
  race_readiness_weight_hrv: { default: 20, min: 0, max: 100, unit: 'peso', group: 'disposicion' },
  race_readiness_weight_activity: { default: 10, min: 0, max: 100, unit: 'peso', group: 'disposicion' },
  race_readiness_tsb_span: { default: 10, min: 3, max: 50, unit: 'puntos', group: 'disposicion' },
  progress_adherence_min_pct: { default: 75, min: 0, max: 100, unit: 'pct', group: 'progresion' },
  progress_acr_high_pct: { default: 150, min: 100, max: 300, unit: 'pct', group: 'progresion' },
  progress_acr_low_pct: { default: 50, min: 10, max: 100, unit: 'pct', group: 'progresion' },
  progress_tsb_fatigue: { default: 25, min: 5, max: 80, unit: 'puntos', group: 'progresion' },
  progress_benchmark_drop_pct: { default: 2, min: 0, max: 20, unit: 'pct', group: 'progresion' },
  pause_budget_days: { default: 28, min: 0, max: 365, unit: 'dias', group: 'pausas' },
  intake_low_sleep_max: { default: 4, min: 1, max: 10, unit: 'escala10', group: 'alta' },
  intake_high_stress_min: { default: 7, min: 1, max: 10, unit: 'escala10', group: 'alta' },
  // ── La muñeca al correr (0282). Defectos = los números que hoy llevan el kit
  // (`REGLAS_AVISO_DEFECTO`, `METODO_RESUMEN_DEFECTO`) y `Vivo` en Swift. ───────
  wrist_slack_pace_s: { default: 3, min: 0, max: 30, unit: 'segundos', group: 'muneca_avisos' },
  wrist_slack_hr_bpm: { default: 2, min: 0, max: 20, unit: 'latidos', group: 'muneca_avisos' },
  wrist_slack_split500_s: { default: 2, min: 0, max: 30, unit: 'segundos', group: 'muneca_avisos' },
  wrist_slack_watts: { default: 10, min: 0, max: 100, unit: 'vatios', group: 'muneca_avisos' },
  wrist_slack_cadence_spm: { default: 3, min: 0, max: 30, unit: 'pasos', group: 'muneca_avisos' },
  wrist_alert_gap_s: { default: 20, min: 5, max: 300, unit: 'segundos', group: 'muneca_avisos' },
  wrist_alert_confirm_s: { default: 4, min: 0, max: 30, unit: 'segundos', group: 'muneca_avisos' },
  wrist_alert_zone_grace_s: { default: 45, min: 0, max: 300, unit: 'segundos', group: 'muneca_avisos' },
  wrist_alert_in_warmup: { default: 0, min: 0, max: 1, unit: 'si_no', group: 'muneca_avisos' },
  wrist_alert_in_recovery: { default: 0, min: 0, max: 1, unit: 'si_no', group: 'muneca_avisos' },
  wrist_alert_continuous_zone: { default: 1, min: 0, max: 2, unit: 'sentido', group: 'muneca_avisos' },
  wrist_prewarn_s: { default: 10, min: 0, max: 60, unit: 'segundos', group: 'muneca_pasos' },
  wrist_prewarn_m: { default: 100, min: 0, max: 500, unit: 'metros', group: 'muneca_pasos' },
  wrist_prewarn_min_step_s: { default: 30, min: 0, max: 300, unit: 'segundos', group: 'muneca_pasos' },
  wrist_auto_lap_m: { default: 1000, min: 0, max: 10000, unit: 'metros', group: 'muneca_correr' },
  wrist_auto_lap_rodaje: { default: 1, min: 0, max: 1, unit: 'si_no', group: 'muneca_correr' },
  wrist_auto_lap_tirada: { default: 1, min: 0, max: 1, unit: 'si_no', group: 'muneca_correr' },
  wrist_auto_lap_tempo: { default: 0, min: 0, max: 1, unit: 'si_no', group: 'muneca_correr' },
  wrist_auto_lap_progresivo: { default: 0, min: 0, max: 1, unit: 'si_no', group: 'muneca_correr' },
  wrist_auto_lap_carrera: { default: 0, min: 0, max: 1, unit: 'si_no', group: 'muneca_correr' },
  wrist_long_run_min: { default: 75, min: 20, max: 300, unit: 'minutos', group: 'muneca_correr' },
  wrist_long_run_km: { default: 16, min: 5, max: 60, unit: 'km', group: 'muneca_correr' },
  wrist_stride_max_s: { default: 30, min: 5, max: 120, unit: 'segundos', group: 'muneca_correr' },
  wrist_gate_manual: { default: 0, min: 0, max: 1, unit: 'si_no', group: 'muneca_correr' },
  wrist_short_rep_done_pct: { default: 90, min: 50, max: 100, unit: 'pct', group: 'muneca_cierre' },
  wrist_idle_save_min: { default: 10, min: 1, max: 60, unit: 'minutos', group: 'muneca_cierre' },
} as const satisfies Record<string, ThresholdSpec>;

export type CoachThresholdKey = keyof typeof COACH_THRESHOLD_SPEC;

/** La vuelta automática más corta que tiene sentido: por debajo, el GPS aún no ha dado un ritmo. */
export const WRIST_AUTO_LAP_MIN_M = 100;

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

/**
 * Pesos RELATIVOS: el motor divide cada uno por la suma del grupo, así que los
 * pesos efectivos suman 1 por construcción y el coach puede guardar campo a
 * campo (la pantalla guarda al salir de cada uno) sin pasar por estados que no
 * suman. Lo único incoherente es un grupo entero a cero.
 */
export const THRESHOLD_WEIGHT_GROUPS = {
  readiness: [
    'readiness_weight_checkin',
    'readiness_weight_hrv',
    'readiness_weight_sleep',
    'readiness_weight_rhr',
    'readiness_weight_recovery',
  ],
  race_readiness: [
    'race_readiness_weight_freshness',
    'race_readiness_weight_adherence',
    'race_readiness_weight_hrv',
    'race_readiness_weight_activity',
  ],
} as const satisfies Record<string, readonly CoachThresholdKey[]>;

export type ThresholdWeightGroup = keyof typeof THRESHOLD_WEIGHT_GROUPS;

/** El grupo de pesos al que pertenece una clave, o null. */
export function weightGroupOf(key: CoachThresholdKey): ThresholdWeightGroup | null {
  for (const g of Object.keys(THRESHOLD_WEIGHT_GROUPS) as ThresholdWeightGroup[]) {
    if ((THRESHOLD_WEIGHT_GROUPS[g] as readonly CoachThresholdKey[]).includes(key)) return g;
  }
  return null;
}

/** Los pesos de un grupo, normalizados (suman 1). Todo a cero → null (no hay reparto). */
export function normalizedWeights<G extends ThresholdWeightGroup>(
  t: CoachThresholds,
  group: G,
): Record<(typeof THRESHOLD_WEIGHT_GROUPS)[G][number], number> | null {
  const keys = THRESHOLD_WEIGHT_GROUPS[group] as readonly CoachThresholdKey[];
  const sum = keys.reduce((s, k) => s + t[k], 0);
  if (sum <= 0) return null;
  return Object.fromEntries(keys.map((k) => [k, t[k] / sum])) as Record<
    (typeof THRESHOLD_WEIGHT_GROUPS)[G][number],
    number
  >;
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
  if (normalizedWeights(t, 'readiness') == null) {
    issues.push({
      key: 'readiness_weight_checkin',
      message: 'Al menos una parte del readiness tiene que pesar algo.',
    });
  }
  if (normalizedWeights(t, 'race_readiness') == null) {
    issues.push({
      key: 'race_readiness_weight_freshness',
      message: 'Al menos una parte del índice de disposición tiene que pesar algo.',
    });
  }
  if (t.progress_acr_low_pct >= t.progress_acr_high_pct) {
    issues.push({
      key: 'progress_acr_low_pct',
      message: 'El límite de infraentrenado tiene que estar por debajo del de sobrecarga.',
    });
  }
  // Muñeca: dos reglas, cada una dentro de SU grupo (un test lo vigila).
  if (t.wrist_auto_lap_m > 0 && t.wrist_auto_lap_m < WRIST_AUTO_LAP_MIN_M) {
    issues.push({
      key: 'wrist_auto_lap_m',
      message: `La vuelta automática se apaga con 0 o es de ${WRIST_AUTO_LAP_MIN_M} m en adelante.`,
    });
  }
  if (t.wrist_prewarn_s > 0 && t.wrist_prewarn_min_step_s < 2 * t.wrist_prewarn_s) {
    issues.push({
      key: 'wrist_prewarn_min_step_s',
      message: 'El paso más corto con preaviso tiene que durar al menos el doble del preaviso: si no, el aviso sería la mitad del paso.',
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
