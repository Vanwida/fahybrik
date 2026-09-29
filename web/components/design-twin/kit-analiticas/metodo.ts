// EL MÉTODO DE ANALÍTICAS DEL COACH, AMPLIADO — lo que el modelo (A6, §4)
// añade a `coach_analytics_method` y hoy no tiene ni columna ni editor.
//
// HARD RULE Nº0: «¿otro entrenador competente lo haría distinto?». Para todo
// lo de aquí, sí. Por eso nace como DATO con valor por defecto, nunca como
// `const` en una pantalla: dónde cortan las bandas de frescura y cómo se
// llaman, cuánta holgura tiene «dentro» por eje, qué peldaño de carga gana
// en cada familia, qué fórmula estima el 1RM, a partir de cuánto un cambio es
// cambio, cuánta cobertura exige un veredicto, cuántos días hacen viejo un
// dato. Los defectos son el comportamiento propuesto en el modelo (los de
// mercado donde el modelo los cita); un coach que no toca nada ve esto.
//
// Los campos que YA existen en `shared/domain/analytics/metodo.ts` (42/7,
// subida, cociente, velocidad crítica, recuperación) se heredan, no se copian.
//
// Puro y sin base de datos.

import { DEFAULT_COACH_ANALYTICS_METHOD, type CoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics';
import { DEFAULT_COACH_HR_METHOD } from '@fahybrid/shared/domain/coach/hr-method';
import type { EstadoFrescuraClave, FamiliaGrande, Ventana } from './contrato';

// ---------------------------------------------------------------------------
// Frescura: cinco estados con bandas y NOMBRES del coach
// ---------------------------------------------------------------------------

export interface BandaFrescura {
  clave: EstadoFrescuraClave;
  /** Tope inclusive de la banda. `null` en la última (hasta infinito). */
  hasta: number | null;
  /** La palabra que ve el atleta. Castellano de box, sin siglas. */
  nombre_es: string;
  /** Una línea para la glosa. */
  glosa_es: string;
}

/** Defecto de mercado (§4): sobrecarga ≤ −30 · óptimo −29…−11 · mantener −10…4 · fresco 5…29 · recargando ≥ 30. */
export const BANDAS_FRESCURA_DEFECTO: readonly BandaFrescura[] = [
  { clave: 'sobrecarga', hasta: -30, nombre_es: 'Pasado de carga', glosa_es: 'Llevas más fatiga de la que asimilas. Toca aflojar.' },
  { clave: 'optimo', hasta: -11, nombre_es: 'Cargando bien', glosa_es: 'Fatiga alta y forma subiendo: el punto donde se construye.' },
  { clave: 'mantener', hasta: 4, nombre_es: 'Manteniendo', glosa_es: 'Fatiga y forma a la par: ni ganas ni pierdes.' },
  { clave: 'fresco', hasta: 29, nombre_es: 'Fresco', glosa_es: 'Descansado: el estado para competir o para un test.' },
  { clave: 'recargando', hasta: null, nombre_es: 'Recargando', glosa_es: 'Demasiado descanso: la forma empieza a bajar.' },
];

// ---------------------------------------------------------------------------
// Cumplimiento por tramo: cuánta holgura tiene «dentro» en cada eje (A8)
// ---------------------------------------------------------------------------

export type EjeCumplimiento = 'ritmo' | 'split' | 'vatios' | 'zona' | 'ppm' | 'reps' | 'kg' | 'rir' | 'rondas' | 'tiempo' | 'calorias';

export interface ToleranciaEje {
  /** `pct` sobre el objetivo, `abs` en la unidad del eje. */
  tipo: 'pct' | 'abs';
  valor: number;
  /** En qué dirección es «más intensidad»: menos segundos en ritmo y split; más kg, reps, vatios; menos RIR. */
  masEsMas: boolean;
}

export const TOLERANCIAS_DEFECTO: Record<EjeCumplimiento, ToleranciaEje> = {
  ritmo: { tipo: 'pct', valor: 3, masEsMas: false },
  split: { tipo: 'pct', valor: 2, masEsMas: false },
  vatios: { tipo: 'pct', valor: 5, masEsMas: true },
  zona: { tipo: 'abs', valor: 0, masEsMas: true },
  ppm: { tipo: 'abs', valor: 3, masEsMas: true },
  reps: { tipo: 'abs', valor: 0, masEsMas: true },
  kg: { tipo: 'abs', valor: 2.5, masEsMas: true },
  rir: { tipo: 'abs', valor: 1, masEsMas: false },
  rondas: { tipo: 'abs', valor: 0, masEsMas: true },
  tiempo: { tipo: 'pct', valor: 5, masEsMas: false },
  calorias: { tipo: 'abs', valor: 0, masEsMas: true },
};

// ---------------------------------------------------------------------------
// La escalera de carga por familia (§4): gana el primer peldaño con dato y ancla
// ---------------------------------------------------------------------------

export type PeldanoCarga = 'potencia' | 'ritmo' | 'pulso' | 'esfuerzo';

export const PELDANO_NOMBRE: Record<PeldanoCarga, string> = {
  potencia: 'vatios',
  ritmo: 'ritmo',
  pulso: 'pulso',
  esfuerzo: 'esfuerzo',
};

export const PRIORIDAD_CARGA_DEFECTO: Record<FamiliaGrande, readonly PeldanoCarga[]> = {
  correr: ['ritmo', 'pulso', 'esfuerzo'],
  ergo: ['potencia', 'pulso', 'esfuerzo'],
  fuerza: ['esfuerzo', 'pulso'],
  'estaciones-wod': ['pulso', 'esfuerzo'],
};

// ---------------------------------------------------------------------------
// Umbral de cambio significativo por métrica (A3: en la MISMA unidad del dato)
// ---------------------------------------------------------------------------

export interface UmbralesCambio {
  ritmo_umbral_s_km: number;
  split_umbral_s_500: number;
  vatios_umbral_w: number;
  rm_kg: number;
  vfc_ms: number;
  fc_reposo_ppm: number;
  sueno_h: number;
  carga_semana_tss: number;
  prevision_carrera_s: number;
  motor_s_km: number;
  estacion_s: number;
}

export const UMBRALES_CAMBIO_DEFECTO: UmbralesCambio = {
  ritmo_umbral_s_km: 3,
  split_umbral_s_500: 1,
  vatios_umbral_w: 5,
  rm_kg: 2.5,
  vfc_ms: 5,
  fc_reposo_ppm: 3,
  sueno_h: 0.5,
  carga_semana_tss: 10,
  prevision_carrera_s: 30,
  motor_s_km: 5,
  estacion_s: 3,
};

// ---------------------------------------------------------------------------
// El método entero
// ---------------------------------------------------------------------------

export type Formula1Rm = 'epley' | 'brzycki';

export interface MetodoAnaliticas extends CoachAnalyticsMethod {
  bandas_frescura: readonly BandaFrescura[];
  /** Por debajo, el veredicto «vas a más / te pasas» se retira (§4, defecto 90). */
  cobertura_minima_veredicto_pct: number;
  tolerancias: Record<EjeCumplimiento, ToleranciaEje>;
  prioridad_carga: Record<FamiliaGrande, readonly PeldanoCarga[]>;
  formula_1rm: Formula1Rm;
  umbrales_cambio: UmbralesCambio;
  /** Días de la basal de recuperación (VFC, FC reposo, sueño) contra la que se lee lo reciente. */
  ventana_basal_dias: number;
  /** Ventana de lo reciente en recuperación (las últimas N noches). */
  reciente_dias: number;
  /** El reparto de polarización que el coach considera bueno (de su método de FC). */
  polarizacion: { zona_baja_hasta: number; zona_media_hasta: number; objetivo: { baja: number; media: number; alta: number } };
  /** A partir de cuántos días sin dato un bloque es «dato viejo». */
  dato_viejo_dias: number;
  /** Muestras mínimas para que un bloque deje de ser «poco dato». */
  muestras_minimas: number;
  /** Por debajo de este % de la ventana con dato, un bloque es «poco dato» aunque tenga muestras. */
  cobertura_poco_pct: number;
  /** Semanas mínimas de historia para que forma y fatiga sean fiables (la ventana del fondo). */
  semanas_minimas_forma: number;
  ventana_por_defecto: Ventana;
  /** Cuánto pesa una hora a RPE 10 en unidades de carga (la equivalencia de la fuerza vía esfuerzo, §8). */
  esfuerzo_tss_hora_rpe10: number;
  /** Las palabras de la disposición de hoy (0–100), por bandas: hoy viven en Swift (P16) y aquí pasan a dato. */
  bandas_disposicion: readonly BandaDisposicion[];
}

export interface BandaDisposicion {
  /** Tope inclusive; `null` en la última. */
  hasta: number | null;
  nombre_es: string;
}

export const BANDAS_DISPOSICION_DEFECTO: readonly BandaDisposicion[] = [
  { hasta: 44, nombre_es: 'Tocado' },
  { hasta: 64, nombre_es: 'Regular' },
  { hasta: null, nombre_es: 'Preparado' },
];

export function palabraDisposicion(valor: number, bandas: readonly BandaDisposicion[]): string {
  for (const b of bandas) if (b.hasta == null || valor <= b.hasta) return b.nombre_es;
  return bandas[bandas.length - 1]!.nombre_es;
}

export const METODO_DEFECTO: MetodoAnaliticas = {
  ...DEFAULT_COACH_ANALYTICS_METHOD,
  bandas_frescura: BANDAS_FRESCURA_DEFECTO,
  cobertura_minima_veredicto_pct: 90,
  tolerancias: TOLERANCIAS_DEFECTO,
  prioridad_carga: PRIORIDAD_CARGA_DEFECTO,
  formula_1rm: 'epley',
  umbrales_cambio: UMBRALES_CAMBIO_DEFECTO,
  ventana_basal_dias: 60,
  reciente_dias: 7,
  polarizacion: {
    zona_baja_hasta: DEFAULT_COACH_HR_METHOD.polarization_low_max_zone,
    zona_media_hasta: DEFAULT_COACH_HR_METHOD.polarization_mid_max_zone,
    objetivo: {
      baja: DEFAULT_COACH_HR_METHOD.polarization_low_pct,
      media: DEFAULT_COACH_HR_METHOD.polarization_mid_pct,
      alta: DEFAULT_COACH_HR_METHOD.polarization_high_pct,
    },
  },
  dato_viejo_dias: 14,
  muestras_minimas: 3,
  cobertura_poco_pct: 34,
  semanas_minimas_forma: 6,
  ventana_por_defecto: '12s',
  esfuerzo_tss_hora_rpe10: 100,
  bandas_disposicion: BANDAS_DISPOSICION_DEFECTO,
};

/**
 * Cómo se reparte un tiempo objetivo entre los 17 tramos de una carrera:
 * fracciones que suman 1. Es el perfil de referencia con el que se lee el
 * hueco por tramo («te faltan 48 s en el sled push»), y es MÉTODO: un coach
 * puede pedir un reparto distinto a su atleta. Defecto: un reparto tipo de
 * HYROX (ocho carreras ≈ 46 %, estaciones ≈ 47 %, Roxzone ≈ 7 %).
 */
export const REPARTO_CARRERA_DEFECTO: Readonly<Record<string, number>> = {
  run1: 0.059, ski: 0.052, run2: 0.061, sled_push: 0.044, run3: 0.063, sled_pull: 0.058, run4: 0.064, burpee_broad_jump: 0.057,
  run5: 0.065, row: 0.053, run6: 0.066, farmers: 0.027, run7: 0.067, lunges: 0.056, run8: 0.065, wall_balls: 0.073, roxzone: 0.07,
};

/** El glosario a un toque (A5): nombres nuestros, siglas de TrainingPeaks al lado, una línea. */
export const GLOSARIO: ReadonlyArray<{ termino: string; sigla: string; que_es: string }> = [
  { termino: 'Forma', sigla: 'CTL', que_es: 'La carga que llevas encima de fondo: media de los últimos 42 días (los días los fija tu coach).' },
  { termino: 'Fatiga', sigla: 'ATL', que_es: 'El cansancio reciente: media de los últimos 7 días.' },
  { termino: 'Frescura', sigla: 'TSB', que_es: 'Forma menos fatiga. En positivo llegas descansado; en negativo, cargado.' },
  { termino: 'Carga', sigla: 'TSS', que_es: 'Cuánto pesa un entreno: 1 hora en tu umbral son 100. Sale del ritmo, los vatios, el pulso o tu esfuerzo, por ese orden.' },
  { termino: 'Motor', sigla: 'EF', que_es: 'Lo rápido que vas al mismo pulso. Si mejora, corres más por el mismo esfuerzo.' },
  { termino: 'Disposición', sigla: '', que_es: 'Cómo llegas hoy, según tu variabilidad, tu pulso en reposo y tu sueño contra tu basal.' },
];

/** Fórmulas de 1RM estimado (método del coach). */
export function unaRmEstimada(kg: number, reps: number, formula: Formula1Rm): number {
  if (reps <= 1) return kg;
  return formula === 'epley' ? kg * (1 + reps / 30) : kg * (36 / (37 - reps));
}
