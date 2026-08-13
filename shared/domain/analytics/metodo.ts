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
//
// Los defectos son EXACTAMENTE el comportamiento de hoy, así que un coach que no
// toca nada ve los mismos números que veía. Ese es el contrato de la regla: la
// edición existe, el cambio no es forzoso.
//
// El resolutor (`web/lib/coach/analytics-method.ts`) mezcla la fila del coach
// sobre estos defectos — mismo patrón que `running-thresholds.ts`.
//
// Puro y sin base de datos, como el resto de `shared/domain`.

import { ATL_DECAY_DAYS, CTL_DECAY_DAYS } from '../training-load/banister';

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
  return { ...DEFAULT_COACH_ANALYTICS_METHOD };
}

/** Las claves editables, para recorrerlas sin repetir la lista a mano. */
export const COACH_ANALYTICS_METHOD_KEYS = Object.keys(
  DEFAULT_COACH_ANALYTICS_METHOD,
) as Array<keyof CoachAnalyticsMethod>;

// ── Límites, compartidos por el validador de la API y por el CHECK de la tabla ──
// Viven aquí para que el formulario del coach y la base de datos no puedan
// discrepar sobre qué es un valor admisible.

export const ANALYTICS_METHOD_BOUNDS: Readonly<
  Record<keyof CoachAnalyticsMethod, { min: number; max: number }>
> = {
  // Por debajo de 14 días el «fondo» ya no es fondo (es otra media de lo
  // reciente); por encima de 90 no reacciona a un bloque entero.
  ctl_days: { min: 14, max: 90 },
  // Por debajo de 3 días lo reciente es la sesión de ayer; por encima de 21 deja
  // de distinguirse del fondo.
  atl_days: { min: 3, max: 21 },
  ramp_alert_tss_per_week: { min: 1, max: 50 },
  acr_low: { min: 0.3, max: 1 },
  acr_high: { min: 1, max: 3 },

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
  return errores;
}
