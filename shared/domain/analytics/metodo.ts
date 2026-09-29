// @fahybrid/shared/domain/analytics/metodo — lo que en las analíticas es MÉTODO
// del coach y por tanto nace como DATO EDITABLE, nunca como `const`.
//
// LA PREGUNTA QUE DECIDE (HARD RULE Nº0)
// --------------------------------------
// «¿Otro entrenador competente lo haría distinto?». Para todo lo de aquí, sí:
//
//   • CÓMO se calcula una media móvil exponencial de la carga es MECANISMO
//     (`banister.ts`): es aritmética, no hay dos maneras correctas.
//   • SOBRE CUÁNTOS DÍAS se promedia es MÉTODO: 42/7 es el reparto de
//     TrainingPeaks, pero hay escuelas que trabajan a 28/7 porque su bloque dura
//     cuatro semanas y un fondo de seis les llega tarde.
//   • QUE un ajuste de velocidad crítica con dos esfuerzos casi iguales no
//     signifique nada es MECANISMO (dos puntos pegados no separan dos
//     parámetros). CUÁNTA separación exigir es MÉTODO.
//   • QUÉ peldaño de la escalera de carga se mira primero en cada modalidad
//     (potencia, ritmo, pulso, esfuerzo), DÓNDE cortan las cinco bandas de
//     frescura, QUÉ subida es cambio y no ruido, CUÁNTA cobertura exige un
//     veredicto: método, con el defecto de mercado (29-09-2026, modelo A6).
//
// Los defectos son EXACTAMENTE el comportamiento de hoy, así que un coach que no
// toca nada ve los mismos números que veía. Ese es el contrato de la regla: la
// edición existe, el cambio no es forzoso.
//
// El resolutor (`web/lib/coach/analytics-method.ts`) mezcla la fila del coach
// sobre estos defectos — mismo patrón que `running-thresholds.ts`.
//
// Puro y sin base de datos, como el resto de `shared/domain`.

import { HRV_BASELINE_FROM_DAYS, HRV_BASELINE_TO_DAYS } from '../biometrics/hrv-baseline';
import { ATL_DECAY_DAYS, CTL_DECAY_DAYS } from '../training-load/banister';
import { LOAD_COVERAGE_MIN } from '../training-load/coverage';
import { DEFAULT_ABSOLUTE_RULE, DEFAULT_BAND_RULE } from '../adherence/bands';

// ── Vocabulario de la carga única ────────────────────────────────────────────

/** Los cuatro peldaños de la escalera de carga (modelo §4). */
export const FUENTES_CARGA = ['potencia', 'ritmo', 'pulso', 'esfuerzo'] as const;
export type FuenteCarga = (typeof FUENTES_CARGA)[number];

/** Las modalidades para las que el coach ordena la escalera (el vocabulario de tramos). */
export const MODALIDADES_CARGA = ['run', 'row', 'ski', 'bike', 'strength', 'other'] as const;
export type ModalidadCarga = (typeof MODALIDADES_CARGA)[number];

/**
 * Qué peldaños PUEDE listar cada modalidad. Potencia solo en máquinas con
 * vatios; ritmo solo en correr (en un ergo ritmo y potencia son la misma
 * medida, y el peldaño se llama potencia). Es mecanismo: no hay vatios de una
 * sentadilla que preciar.
 */
export const FUENTES_ADMISIBLES: Record<ModalidadCarga, readonly FuenteCarga[]> = {
  run: ['ritmo', 'pulso', 'esfuerzo'],
  row: ['potencia', 'pulso', 'esfuerzo'],
  ski: ['potencia', 'pulso', 'esfuerzo'],
  bike: ['potencia', 'pulso', 'esfuerzo'],
  strength: ['pulso', 'esfuerzo'],
  other: ['pulso', 'esfuerzo'],
};

/** Sobre qué se mide el cumplimiento. */
export const BASES_CUMPLIMIENTO = ['sesiones', 'tramos', 'carga'] as const;
export type BaseCumplimiento = (typeof BASES_CUMPLIMIENTO)[number];

/**
 * Contra qué se compara UNA sesión hecha con su plan (el «verde/ámbar/rojo» de
 * cada sesión, 29-09-2026). El coach ordena las tres; manda la primera que las
 * DOS partes saben: la carga planificada y la hecha, la duración escrita y la
 * hecha, la distancia escrita y la hecha. Es la escalera de TrainingPeaks
 * (carga › duración › distancia), aquí editable.
 */
export const BASES_SESION = ['carga', 'duracion', 'distancia'] as const;
export type BaseSesion = (typeof BASES_SESION)[number];

/**
 * Una fila por coach (`coach_analytics_method`, único por `coach_id`).
 * Todos los campos son obligatorios: guardar reemplaza el conjunto entero.
 */
export interface CoachAnalyticsMethod {
  // ── LA CARGA ──────────────────────────────────────────────────────────────

  /** Días de la media móvil del FONDO (carga crónica). */
  ctl_days: number;
  /** Días de la media móvil de lo RECIENTE (carga aguda). */
  atl_days: number;
  /**
   * Subida de fondo por semana a partir de la cual el ritmo de subida avisa.
   * En unidades de carga por semana: es cuánto crece el fondo en siete días.
   * El +5/semana de partida es el corte que el sector usa para separar «sube»
   * de «sube demasiado rápido».
   */
  ramp_alert_tss_per_week: number;
  /**
   * Bandas del cociente reciente/fondo. Por debajo de `acr_low` la carga
   * reciente no sostiene el fondo; por encima de `acr_high` se acumula más
   * rápido de lo que se asimila.
   */
  acr_low: number;
  acr_high: number;

  // ── LA CARGA ÚNICA (29-09-2026) ───────────────────────────────────────────

  /** Orden de peldaños por modalidad. Gana el primero con dato y ancla. */
  fuentes_run: FuenteCarga[];
  fuentes_row: FuenteCarga[];
  fuentes_ski: FuenteCarga[];
  fuentes_bike: FuenteCarga[];
  fuentes_strength: FuenteCarga[];
  fuentes_other: FuenteCarga[];
  /**
   * Cuánto vale una hora de fuerza a esfuerzo X frente a una hora de cardio al
   * mismo esfuerzo. Elección de modelo (TrainingPeaks no la hace; WHOOP sí, a su
   * manera): 1,0 = la misma unidad para todo, que es lo que permite una sola
   * curva de forma.
   */
  fuerza_coeficiente: number;
  /**
   * Porcentaje del tiempo entrenado que tiene que estar preciado para que la
   * frescura diga su palabra. Por debajo, el número se queda y la palabra se
   * retira (DECISIONS 2026-07-28, «número sí, sentencia no»).
   */
  cobertura_veredicto_min_pct: number;

  // ── LA FRESCURA (cinco estados, cuatro cortes) ────────────────────────────

  /** Frescura ≤ esto: sobrecarga. */
  frescura_sobrecarga_hasta: number;
  /** Hasta aquí: óptimo para construir. */
  frescura_optimo_hasta: number;
  /** Hasta aquí: mantener. */
  frescura_mantener_hasta: number;
  /** Hasta aquí: fresco (para competir). Por encima: recargando (perdiendo forma). */
  frescura_fresco_hasta: number;

  // ── EL CUMPLIMIENTO ───────────────────────────────────────────────────────

  /** Sobre qué se mide: sesiones hechas, tramos dentro de banda, o carga hecha frente a planificada. */
  cumplimiento_base: BaseCumplimiento;
  /** A partir de este porcentaje el cumplimiento es bueno. */
  cumplimiento_bien_pct: number;
  /** A partir de este porcentaje es regular; por debajo, malo. */
  cumplimiento_regular_pct: number;

  // ── EL CUMPLIMIENTO DE CADA SESIÓN (hecho frente a plan, 29-09-2026) ─────

  /** Orden de bases para comparar una sesión con su plan; manda la primera que se sabe. */
  cumplimiento_sesion_bases: BaseSesion[];
  /** Hecha entre estos dos porcentajes de su plan (inclusive): cumplida (verde). */
  cumplimiento_verde_min_pct: number;
  cumplimiento_verde_max_pct: number;
  /**
   * Fuera de la verde pero entre estos dos (inclusive): desviada (ámbar). Fuera
   * de estos, o no hecha: roja. Sin plan: gris.
   */
  cumplimiento_ambar_min_pct: number;
  cumplimiento_ambar_max_pct: number;

  // ── LA HOLGURA DE CADA TRAMO (la del vivo, 29-09-2026) ────────────────────
  //
  // Cuánto puede salirse un tramo de su banda sin dejar de estar DENTRO. Es la
  // misma histéresis con la que el vivo juzga una serie cerrada (banda ± holgura,
  // con dirección), para que la pantalla del reloj y las analíticas no digan
  // dos cosas distintas del mismo tramo. Un objetivo de valor único («@4:30»)
  // se convierte así en una banda.

  /** Ritmo de carrera, en segundos por km. */
  holgura_ritmo_s_km: number;
  /** Split de ergómetro, en segundos por 500 m. */
  holgura_split_s_500m: number;
  /** Potencia, en vatios. */
  holgura_vatios_w: number;
  /** Pulso, en latidos (zona o banda en ppm). */
  holgura_pulso_ppm: number;
  /** RPE, en puntos de la escala 1-10. */
  holgura_rpe: number;
  /** RIR, en repeticiones en reserva. */
  holgura_rir: number;
  /** Carga de la barra o del implemento, en % del peso prescrito. */
  holgura_carga_pct: number;
  /**
   * Dosis (distancia, tiempo, repeticiones, calorías), en % de lo prescrito.
   * En el trabajo el fallo es quedarse corto; en la recuperación, pasarse.
   */
  holgura_dosis_pct: number;

  // ── EL CAMBIO SIGNIFICATIVO, POR MÉTRICA (contra el periodo anterior) ─────

  /** Cambio de carga (TSS) entre periodos que cuenta como cambio, en %. */
  cambio_carga_pct: number;
  /** Cambio de horas entre periodos que cuenta, en %. */
  cambio_horas_pct: number;
  /** Cambio de forma (fondo) que cuenta, en unidades de carga. */
  cambio_forma_tss: number;
  /** Cambio de frescura que cuenta, en unidades de carga. */
  cambio_frescura_tss: number;
  /** Cambio de variabilidad que cuenta, en %. */
  cambio_variabilidad_pct: number;
  /** Cambio de pulso en reposo que cuenta, en latidos. */
  cambio_pulso_reposo_bpm: number;
  /** Cambio de sueño que cuenta, en horas. */
  cambio_sueno_horas: number;
  /** Cambio de un porcentaje de cumplimiento o adherencia que cuenta, en PUNTOS (90 % → 80 % son 10). */
  cambio_cumplimiento_pts: number;

  // ── LA VENTANA BASAL (recuperación) ───────────────────────────────────────

  /** Días hacia atrás desde los que se promedia el basal. */
  basal_dias: number;
  /** Días más recientes que se EXCLUYEN del basal (para que una caída aguda no arrastre su propia referencia). */
  basal_excluir_dias: number;

  // ── LA CAPACIDAD (velocidad crítica y depósito) ────────────────────────────

  /**
   * Esfuerzos independientes mínimos para intentar el ajuste. Con dos, la recta
   * pasa exacta por los dos puntos y el ajuste parece perfecto siempre: no es
   * que se ajuste bien, es que no hay nada que ajustar.
   */
  cs_min_efforts: number;
  /**
   * Ventana de duración admisible de cada esfuerzo, en segundos. Fuera de ella
   * el modelo de dos parámetros deja de describir a un humano: por debajo manda
   * la potencia de arranque y la velocidad crítica sale inflada; por encima
   * entra la reserva de combustible, que el modelo no contempla, y sale hundida.
   */
  cs_min_duration_s: number;
  cs_max_duration_s: number;
  /**
   * Separación mínima entre el esfuerzo más largo y el más corto (proporción).
   * Tres esfuerzos de duración parecida son, para el ajuste, un solo punto
   * repetido tres veces.
   */
  cs_min_spread_ratio: number;
  /** Bondad del ajuste mínima, en porcentaje (95 = R² de 0,95). */
  cs_min_fit_r2_pct: number;
  /**
   * Cuánto puede alejarse la velocidad crítica del umbral ya medido, en
   * porcentaje, antes de retirar el resultado. La velocidad crítica y el umbral
   * miden casi lo mismo por caminos distintos; si no se parecen, los esfuerzos
   * no fueron máximos y el ajuste describe una tarde floja, no una capacidad.
   */
  cs_max_drift_from_threshold_pct: number;

  // ── LA RECUPERACIÓN ───────────────────────────────────────────────────────

  /** Horas de sueño que se toman como referencia de noche completa. */
  sleep_target_hours: number;
  /**
   * Noches mínimas dentro de la ventana basal para que la variabilidad tenga
   * contra qué compararse. Un basal de tres noches se mueve con cada noche
   * nueva, y entonces el delta mide el basal, no al atleta.
   */
  hrv_min_nights_baseline: number;
  /** Noches mínimas recientes para que el delta de variabilidad se afirme. */
  hrv_min_nights_recent: number;

  // ── LOS HECHOS (lo que la pantalla se atreve a AFIRMAR) ───────────────────

  /**
   * Días sobre los que se lee la subida del fondo. «Has subido un 30 % en dos
   * semanas» es la frase, y catorce días es su «dos semanas» — pero hay
   * escuelas que la leen sobre tres semanas porque su microciclo dura eso.
   */
  subida_dias: number;
  /**
   * Por debajo de este porcentaje, una subida es ruido de redondeo y no se
   * menciona. Nada que ver con el disparo, que es absoluto: esto sólo evita
   * escribir «has subido un 1 %».
   */
  subida_minima_pct: number;
  /**
   * Porcentaje del entrenamiento SIN medir ni puntuar a partir del cual la
   * pantalla lo dice en voz alta. Un coach que exige RPE en todo lo pondrá
   * bajo; otro que sólo mira las sesiones clave, alto.
   */
  cobertura_ciega_alerta_pct: number;
}

/**
 * LOS DEFECTOS = EL COMPORTAMIENTO DE HOY.
 *
 *   - 42/7 días: los mismos `CTL_DECAY_DAYS`/`ATL_DECAY_DAYS` que el motor ya
 *     usaba, importados en vez de repetidos. Si alguien cambia la constante y
 *     no este fichero, el defecto la sigue.
 *   - 0,80/1,30 de cociente: los mismos cortes que la ficha del coach ya
 *     dibujaba (`acrLabel`), ahora en un solo sitio.
 *   - +5 de subida por semana: nuevo, porque hasta hoy no se medía la subida.
 *   - Escalera por modalidad: correr por ritmo antes que por pulso (el ritmo no
 *     deriva con el calor ni con una mala noche); los ergos por potencia; la
 *     fuerza por esfuerzo (el sRPE de Foster es el estándar; el pulso en una
 *     sentadilla no mide el trabajo); el resto por pulso y luego esfuerzo.
 *   - Frescura: sobrecarga ≤ −30, óptimo −29…−11, mantener −10…4, fresco 5…29,
 *     recargando ≥ 30 — las bandas de mercado (TrainingPeaks / Coggan).
 *   - Cobertura mínima del veredicto: el 90 % que ya decidía `LOAD_COVERAGE_MIN`.
 *   - Cambio significativo: 10 % de carga u horas, 5 puntos de forma o
 *     frescura, 5 % de variabilidad, 3 latidos, media hora de sueño.
 *   - Basal 60 → 14 días: la misma ventana de `hrv-baseline.ts`.
 *   - Cumplimiento de una sesión: carga › duración › distancia, verde 80-120 %,
 *     ámbar 50-79 % o 121-150 %, rojo fuera o no hecha — las bandas de mercado
 *     (TrainingPeaks). Un cambio de 10 puntos entre periodos es cambio.
 *   - Holgura por tramo: la del vivo (3 s/km, 2 s/500 m, 10 W, 2 ppm; defectos
 *     de `reglasAvisoDefecto` en el reloj), ±1 de RPE y de RIR (la regla
 *     absoluta de `adherence/bands.ts`), la carga exacta dentro de su rango y un
 *     10 % de dosis (la regla relativa de `adherence/bands.ts`, la misma que ya
 *     juzgaba la duración de una serie de carrera).
 *   - Velocidad crítica: 3 esfuerzos, de 2 a 15 minutos, con el largo al menos
 *     el triple que el corto. Es el protocolo estándar del modelo de dos
 *     parámetros; por debajo de 2 minutos y por encima de 15 el modelo miente.
 *   - 8 horas de sueño: las mismas que la disposición diaria ya tomaba como
 *     noche completa.
 *   - 14 noches de basal: la mitad de la ventana basal de `hrv-baseline.ts`.
 *     Hasta hoy bastaba UNA muestra para emitir un delta, que es el defecto que
 *     este mínimo cierra.
 */
export const DEFAULT_COACH_ANALYTICS_METHOD: CoachAnalyticsMethod = {
  ctl_days: CTL_DECAY_DAYS,
  atl_days: ATL_DECAY_DAYS,
  ramp_alert_tss_per_week: 5,
  acr_low: 0.8,
  acr_high: 1.3,

  fuentes_run: ['ritmo', 'pulso', 'esfuerzo'],
  fuentes_row: ['potencia', 'pulso', 'esfuerzo'],
  fuentes_ski: ['potencia', 'pulso', 'esfuerzo'],
  fuentes_bike: ['potencia', 'pulso', 'esfuerzo'],
  fuentes_strength: ['esfuerzo', 'pulso'],
  fuentes_other: ['pulso', 'esfuerzo'],
  fuerza_coeficiente: 1,
  cobertura_veredicto_min_pct: LOAD_COVERAGE_MIN * 100,

  frescura_sobrecarga_hasta: -30,
  frescura_optimo_hasta: -11,
  frescura_mantener_hasta: 4,
  frescura_fresco_hasta: 29,

  cumplimiento_base: 'sesiones',
  cumplimiento_bien_pct: 90,
  cumplimiento_regular_pct: 70,

  cumplimiento_sesion_bases: ['carga', 'duracion', 'distancia'],
  cumplimiento_verde_min_pct: 80,
  cumplimiento_verde_max_pct: 120,
  cumplimiento_ambar_min_pct: 50,
  cumplimiento_ambar_max_pct: 150,

  holgura_ritmo_s_km: 3,
  holgura_split_s_500m: 2,
  holgura_vatios_w: 10,
  holgura_pulso_ppm: 2,
  holgura_rpe: DEFAULT_ABSOLUTE_RULE.on_target_max,
  holgura_rir: DEFAULT_ABSOLUTE_RULE.on_target_max,
  holgura_carga_pct: 0,
  holgura_dosis_pct: DEFAULT_BAND_RULE.on_target_max * 100,

  cambio_carga_pct: 10,
  cambio_horas_pct: 10,
  cambio_forma_tss: 5,
  cambio_frescura_tss: 5,
  cambio_variabilidad_pct: 5,
  cambio_pulso_reposo_bpm: 3,
  cambio_sueno_horas: 0.5,
  cambio_cumplimiento_pts: 10,

  basal_dias: HRV_BASELINE_FROM_DAYS,
  basal_excluir_dias: HRV_BASELINE_TO_DAYS,

  cs_min_efforts: 3,
  cs_min_duration_s: 120,
  cs_max_duration_s: 900,
  cs_min_spread_ratio: 3,
  cs_min_fit_r2_pct: 95,
  cs_max_drift_from_threshold_pct: 15,

  sleep_target_hours: 8,
  hrv_min_nights_baseline: 14,
  hrv_min_nights_recent: 3,

  subida_dias: 14,
  subida_minima_pct: 5,
  cobertura_ciega_alerta_pct: 25,
};

/** Los defectos, en copia fresca (quien llama puede esparcir y mutar). */
export function defaultCoachAnalyticsMethod(): CoachAnalyticsMethod {
  const d = DEFAULT_COACH_ANALYTICS_METHOD;
  return {
    ...d,
    fuentes_run: [...d.fuentes_run],
    fuentes_row: [...d.fuentes_row],
    fuentes_ski: [...d.fuentes_ski],
    fuentes_bike: [...d.fuentes_bike],
    fuentes_strength: [...d.fuentes_strength],
    fuentes_other: [...d.fuentes_other],
    cumplimiento_sesion_bases: [...d.cumplimiento_sesion_bases],
  };
}

/** Las claves editables, para recorrerlas sin repetir la lista a mano. */
export const COACH_ANALYTICS_METHOD_KEYS = Object.keys(
  DEFAULT_COACH_ANALYTICS_METHOD,
) as Array<keyof CoachAnalyticsMethod>;

/** Las claves que son una LISTA de peldaños (text[] en la tabla). */
export const COACH_ANALYTICS_METHOD_LIST_KEYS = [
  'fuentes_run',
  'fuentes_row',
  'fuentes_ski',
  'fuentes_bike',
  'fuentes_strength',
  'fuentes_other',
  'cumplimiento_sesion_bases',
] as const satisfies ReadonlyArray<keyof CoachAnalyticsMethod>;

export type ClaveListaMetodo = (typeof COACH_ANALYTICS_METHOD_LIST_KEYS)[number];

/** Las listas que son una ESCALERA DE CARGA (una por modalidad). */
export type ClaveFuentesMetodo = Exclude<ClaveListaMetodo, 'cumplimiento_sesion_bases'>;

/** Las claves que son un TEXTO de un vocabulario cerrado. */
export const COACH_ANALYTICS_METHOD_TEXT_KEYS = ['cumplimiento_base'] as const satisfies ReadonlyArray<
  keyof CoachAnalyticsMethod
>;

export type ClaveTextoMetodo = (typeof COACH_ANALYTICS_METHOD_TEXT_KEYS)[number];

/** Las claves NUMÉRICAS: todas menos las listas y los textos. */
export type ClaveNumericaMetodo = Exclude<keyof CoachAnalyticsMethod, ClaveListaMetodo | ClaveTextoMetodo>;

export const COACH_ANALYTICS_METHOD_NUMERIC_KEYS = COACH_ANALYTICS_METHOD_KEYS.filter(
  (k) =>
    !(COACH_ANALYTICS_METHOD_LIST_KEYS as readonly string[]).includes(k) &&
    !(COACH_ANALYTICS_METHOD_TEXT_KEYS as readonly string[]).includes(k),
) as ClaveNumericaMetodo[];

/** La clave de la escalera de una modalidad. */
export function claveFuentesDe(modalidad: ModalidadCarga): ClaveFuentesMetodo {
  return `fuentes_${modalidad}` as ClaveFuentesMetodo;
}

// ── Límites, compartidos por el validador de la API y por el CHECK de la tabla ──
// Viven aquí para que el formulario del coach y la base de datos no puedan
// discrepar sobre qué es un valor admisible.

export const ANALYTICS_METHOD_BOUNDS: Readonly<Record<ClaveNumericaMetodo, { min: number; max: number }>> = {
  // Por debajo de 14 días el «fondo» ya no es fondo (es otra media de lo
  // reciente); por encima de 90 no reacciona a un bloque entero.
  ctl_days: { min: 14, max: 90 },
  // Por debajo de 3 días lo reciente es la sesión de ayer; por encima de 21 deja
  // de distinguirse del fondo.
  atl_days: { min: 3, max: 21 },
  ramp_alert_tss_per_week: { min: 1, max: 50 },
  acr_low: { min: 0.3, max: 1 },
  acr_high: { min: 1, max: 3 },

  fuerza_coeficiente: { min: 0.25, max: 2 },
  cobertura_veredicto_min_pct: { min: 50, max: 100 },

  frescura_sobrecarga_hasta: { min: -80, max: 0 },
  frescura_optimo_hasta: { min: -60, max: 20 },
  frescura_mantener_hasta: { min: -40, max: 40 },
  frescura_fresco_hasta: { min: -20, max: 80 },

  cumplimiento_bien_pct: { min: 50, max: 100 },
  cumplimiento_regular_pct: { min: 0, max: 99 },
  // La verde contiene el 100 % por definición: «hizo lo planificado» es cumplir.
  cumplimiento_verde_min_pct: { min: 50, max: 100 },
  cumplimiento_verde_max_pct: { min: 100, max: 200 },
  cumplimiento_ambar_min_pct: { min: 0, max: 99 },
  cumplimiento_ambar_max_pct: { min: 101, max: 300 },

  // Más allá de estos topes la «holgura» ya es otra banda: 30 s/km es otra
  // zona, 15 ppm media zona de pulso, 3 puntos de RPE otro esfuerzo.
  holgura_ritmo_s_km: { min: 0, max: 30 },
  holgura_split_s_500m: { min: 0, max: 15 },
  holgura_vatios_w: { min: 0, max: 100 },
  holgura_pulso_ppm: { min: 0, max: 15 },
  holgura_rpe: { min: 0, max: 3 },
  holgura_rir: { min: 0, max: 3 },
  holgura_carga_pct: { min: 0, max: 20 },
  holgura_dosis_pct: { min: 0, max: 50 },

  cambio_carga_pct: { min: 1, max: 100 },
  cambio_horas_pct: { min: 1, max: 100 },
  cambio_forma_tss: { min: 1, max: 50 },
  cambio_frescura_tss: { min: 1, max: 50 },
  cambio_variabilidad_pct: { min: 1, max: 50 },
  cambio_pulso_reposo_bpm: { min: 1, max: 20 },
  cambio_sueno_horas: { min: 0.1, max: 5 },
  cambio_cumplimiento_pts: { min: 1, max: 50 },

  basal_dias: { min: 14, max: 180 },
  basal_excluir_dias: { min: 0, max: 60 },

  cs_min_efforts: { min: 3, max: 10 },
  cs_min_duration_s: { min: 60, max: 600 },
  cs_max_duration_s: { min: 300, max: 3600 },
  cs_min_spread_ratio: { min: 1.5, max: 10 },
  cs_min_fit_r2_pct: { min: 50, max: 100 },
  cs_max_drift_from_threshold_pct: { min: 5, max: 50 },

  sleep_target_hours: { min: 5, max: 12 },
  hrv_min_nights_baseline: { min: 3, max: 60 },
  hrv_min_nights_recent: { min: 1, max: 14 },

  // Por debajo de una semana la subida es la sesión de ayer; por encima de seis
  // deja de ser «una subida» y pasa a ser la temporada.
  subida_dias: { min: 7, max: 42 },
  subida_minima_pct: { min: 1, max: 50 },
  cobertura_ciega_alerta_pct: { min: 5, max: 90 },
};

/**
 * Las claves numéricas que la tabla guarda como ENTERO (`smallint`). El editor las
 * exige enteras: un 2,5 en una columna entera no es un 400 de validación, es un
 * 500 de Postgres. Las demás numéricas admiten decimales (`numeric`).
 */
export const COACH_ANALYTICS_METHOD_INTEGER_KEYS: ReadonlySet<ClaveNumericaMetodo> = new Set<ClaveNumericaMetodo>([
  'ctl_days',
  'atl_days',
  'ramp_alert_tss_per_week',
  'cs_min_efforts',
  'cs_min_duration_s',
  'cs_max_duration_s',
  'cs_min_fit_r2_pct',
  'cs_max_drift_from_threshold_pct',
  'hrv_min_nights_baseline',
  'hrv_min_nights_recent',
  'subida_dias',
  'subida_minima_pct',
  'cobertura_ciega_alerta_pct',
  'cobertura_veredicto_min_pct',
  'frescura_sobrecarga_hasta',
  'frescura_optimo_hasta',
  'frescura_mantener_hasta',
  'frescura_fresco_hasta',
  'cumplimiento_bien_pct',
  'cumplimiento_regular_pct',
  'cambio_carga_pct',
  'cambio_horas_pct',
  'cambio_forma_tss',
  'cambio_frescura_tss',
  'cambio_variabilidad_pct',
  'cambio_pulso_reposo_bpm',
  'basal_dias',
  'basal_excluir_dias',
  'cumplimiento_verde_min_pct',
  'cumplimiento_verde_max_pct',
  'cumplimiento_ambar_min_pct',
  'cumplimiento_ambar_max_pct',
  'holgura_vatios_w',
  'holgura_pulso_ppm',
  'cambio_cumplimiento_pts',
]);

/** Cuántos peldaños puede listar una modalidad como mucho (los cuatro, sin repetir). */
export const FUENTES_MAX = FUENTES_CARGA.length;

const NOMBRE_MODALIDAD_ES: Record<ModalidadCarga, string> = {
  run: 'correr',
  row: 'remo',
  ski: 'ski',
  bike: 'bici',
  strength: 'fuerza',
  other: 'el resto',
};

/**
 * Reglas que ningún par de valores puede romper aunque cada uno esté dentro de
 * su rango. Devuelve los mensajes de lo que está mal, vacío si todo cuadra.
 */
export function validarMetodoAnalitico(m: CoachAnalyticsMethod): string[] {
  const errores: string[] = [];
  if (m.atl_days >= m.ctl_days) {
    errores.push('Los días de lo reciente tienen que ser menos que los del fondo.');
  }
  if (m.acr_low >= m.acr_high) {
    errores.push('La banda baja del cociente tiene que quedar por debajo de la alta.');
  }
  if (m.cs_min_duration_s >= m.cs_max_duration_s) {
    errores.push('El esfuerzo más corto admisible tiene que durar menos que el más largo.');
  }
  if (m.cs_max_duration_s / m.cs_min_duration_s < m.cs_min_spread_ratio) {
    errores.push(
      'La ventana de duraciones es más estrecha que la separación que se exige: ningún conjunto de esfuerzos podría cumplir las dos.',
    );
  }
  if (m.hrv_min_nights_recent >= m.hrv_min_nights_baseline) {
    errores.push('Las noches recientes tienen que ser menos que las del basal.');
  }
  if (
    !(
      m.frescura_sobrecarga_hasta < m.frescura_optimo_hasta &&
      m.frescura_optimo_hasta < m.frescura_mantener_hasta &&
      m.frescura_mantener_hasta < m.frescura_fresco_hasta
    )
  ) {
    errores.push('Las bandas de frescura tienen que ir de menor a mayor: sobrecarga, óptimo, mantener, fresco.');
  }
  if (m.cumplimiento_regular_pct >= m.cumplimiento_bien_pct) {
    errores.push('El corte de «regular» tiene que quedar por debajo del de «bien».');
  }
  if (
    !(
      m.cumplimiento_ambar_min_pct < m.cumplimiento_verde_min_pct &&
      m.cumplimiento_verde_min_pct <= 100 &&
      100 <= m.cumplimiento_verde_max_pct &&
      m.cumplimiento_verde_max_pct < m.cumplimiento_ambar_max_pct
    )
  ) {
    errores.push('Las bandas de una sesión van en orden: ámbar por debajo, verde con el 100 % dentro, ámbar por encima.');
  }
  const bases = m.cumplimiento_sesion_bases;
  if (bases.length === 0) {
    errores.push('El cumplimiento de una sesión necesita al menos una base.');
  } else if (new Set(bases).size !== bases.length) {
    errores.push('Las bases del cumplimiento de una sesión repiten una.');
  } else if (bases.some((b) => !(BASES_SESION as readonly string[]).includes(b))) {
    errores.push('Las bases del cumplimiento de una sesión son carga, duración o distancia.');
  }
  if (m.basal_excluir_dias >= m.basal_dias) {
    errores.push('Los días que se excluyen del basal tienen que ser menos que los del basal.');
  }
  for (const modalidad of MODALIDADES_CARGA) {
    const lista = m[claveFuentesDe(modalidad)];
    const nombre = NOMBRE_MODALIDAD_ES[modalidad];
    if (lista.length === 0) {
      errores.push(`La escalera de ${nombre} necesita al menos un peldaño.`);
      continue;
    }
    if (new Set(lista).size !== lista.length) {
      errores.push(`La escalera de ${nombre} repite un peldaño.`);
    }
    const admisibles = FUENTES_ADMISIBLES[modalidad];
    for (const f of lista) {
      if (!admisibles.includes(f)) {
        errores.push(`En ${nombre} no se puede preciar por ${f}.`);
      }
    }
  }
  return errores;
}
