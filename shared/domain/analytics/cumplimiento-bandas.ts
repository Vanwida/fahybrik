// LAS BANDAS DEL CUMPLIMIENTO — contra qué se juzga un tramo, en la unidad de su
// eje, con la holgura del coach (docs/analiticas/modelo.md A8).
//
// Un objetivo escrito («Z5», «4:05–4:20», «@RIR 2», «160 kg», «RPE 8») se
// convierte AQUÍ, una vez, en una banda absoluta del atleta: [min, max] en la
// unidad del eje (s/km, s/500 m, W, ppm, RPE, RIR, kg). La zona se resuelve con
// SU umbral (el ancla resuelta una vez, `anclas.ts`) y las bandas del COACH
// (`methodology_zones` para ritmo, `coach_hr_method` para pulso). Lo que no se
// puede resolver no se inventa: sale con su motivo.
//
// LA ZONA EN UNA LÍNEA PLANA. El canal `hr_zone` de una prescripción plana lleva
// el número de zona del coach: en correr y en las máquinas es su zona de RITMO
// (así la pinta el plan del atleta, `resolveIntensityForItem`, y así la convierte
// `legacyToStructure` en `pace_zone`); en cualquier otra modalidad es de PULSO.
// En la gramática de carrera (#61) `pace_zone` y `hr_zone` ya vienen separadas.
//
// LA HOLGURA es la del vivo: la banda se ensancha por los dos lados en la unidad
// del eje (`juzgarContraBanda`, la misma comparación que usa el reloj para una
// serie cerrada). Así un «@4:30» de valor único es una banda, y la pantalla del
// reloj y las analíticas no discrepan sobre el mismo tramo.
//
// Puro y sin base de datos.

import { juzgarContraBanda, type RunComplianceVerdict } from '../adherence/run-compliance';
import type { SegmentTarget } from '../prescription/run-structure';
import type { Target } from '../prescription/types';
import { resolvePaceBandFromZones, resolveZonesForAthlete, type CoachZone, type ZonePaceUnit } from '../methodology/zone-model';
import { HR_ZONES, type HrZone, type HrZoneFractions } from '../methodology/hr-zones';
import { anclaCuenta, type Ancla, type Unidad } from './lectura';
import type { AnclasAtleta, ModalidadRitmo } from './anclas';
import type { CoachAnalyticsMethod } from './metodo';

// ---------------------------------------------------------------------------
// VOCABULARIO
// ---------------------------------------------------------------------------

/**
 * Lo que se mira de un tramo. Tres preguntas distintas que NUNCA se funden en un
 * número (Alex, 12-ago: «en banda de ritmo y aun así corto de tiempo»):
 *   intensidad  ¿a lo que tocaba? — ritmo, split, vatios, pulso, RPE, RIR, kilos
 *   dosis       ¿cuánto de lo que tocaba? — distancia, tiempo, reps, calorías,
 *               series, rondas
 *   resultado   ¿lo cerró? — el tiempo contra un tope, la estación o el WOD hechos
 */
export type PreguntaCumplimiento = 'intensidad' | 'dosis' | 'resultado';

export const EJES_INTENSIDAD = ['ritmo', 'split', 'vatios', 'pulso', 'rpe', 'rir', 'carga'] as const;
export type EjeIntensidad = (typeof EJES_INTENSIDAD)[number];

export const EJES_DOSIS = ['distancia', 'tiempo', 'reps', 'calorias', 'series', 'rondas'] as const;
export type EjeDosis = (typeof EJES_DOSIS)[number];

export const EJES_RESULTADO = ['tiempo_tope', 'hecha'] as const;
export type EjeResultado = (typeof EJES_RESULTADO)[number];

export type EjeCumplimiento = EjeIntensidad | EjeDosis | EjeResultado;

/** La unidad de cada eje (la del contrato de lecturas). `hecha` no tiene: es sí o no. */
export const UNIDAD_EJE: Record<EjeCumplimiento, Unidad | null> = {
  ritmo: 's_km',
  split: 's_500m',
  vatios: 'watts',
  pulso: 'bpm',
  rpe: 'rpe',
  rir: 'rir',
  carga: 'kg',
  distancia: 'metros',
  tiempo: 'segundos',
  reps: 'reps',
  calorias: 'kcal',
  series: 'series',
  rondas: 'rondas',
  tiempo_tope: 'segundos',
  hecha: null,
};

/** Ejes en los que MENOS es MÁS intenso (o mejor): el ritmo, el split, el RIR y el tiempo contra un tope. */
const EJES_INVERSOS: ReadonlySet<EjeCumplimiento> = new Set(['ritmo', 'split', 'rir', 'tiempo_tope']);

/**
 * El veredicto de una comprobación, con dirección y nunca solo color:
 *   dentro      en su banda (con la holgura del coach)
 *   por_encima  MÁS de lo pedido: más intenso, o se pasó de un descanso
 *   por_debajo  MENOS: menos intenso, o se quedó corto de dosis, o no cerró el tope
 *   sin_dato    no hay contra qué, o no se midió: `motivo` dice por qué
 */
export type VeredictoCumplimiento = 'dentro' | 'por_encima' | 'por_debajo' | 'sin_dato';

/**
 * Por qué una comprobación (o una línea) no tiene veredicto. Vocabulario del
 * cumplimiento — no es una `Falta` de lectura: vive en las filas del detalle.
 *   sin_ancla    la banda sale de un umbral que el atleta no tiene (o es de la edad)
 *   sin_medida   el aparato no midió lo que el eje necesita (pulso, ritmo, vatios)
 *   sin_anotar   lo anota el atleta y no lo anotó (kilos, reps, RPE o RIR de la serie)
 *   pendiente    cuesta por encima de la que retira el ritmo (método del coach)
 *   sin_1rm      un %RM sin los kilos resueltos al entrenar
 *   relativo     un objetivo relativo a una referencia que aquí no se resuelve
 *   sin_objetivo no hay nada escrito contra lo que juzgar
 */
export type MotivoSinDato =
  | 'sin_ancla'
  | 'sin_medida'
  | 'sin_anotar'
  | 'pendiente'
  | 'sin_1rm'
  | 'relativo'
  | 'sin_objetivo';

// ---------------------------------------------------------------------------
// EL OBJETIVO NORMALIZADO — la gramática plana y la de carrera, en un idioma
// ---------------------------------------------------------------------------

type Rango = { min: number | null; max: number | null };

export type ObjetivoTramo =
  | ({ tipo: 'ritmo'; unidad: 'per_km' | 'per_500m' | 'per_mile' } & Rango)
  | { tipo: 'zona_ritmo'; desde: number; hasta: number }
  | { tipo: 'zona_pulso'; desde: number; hasta: number }
  | ({ tipo: 'pulso' } & Rango)
  | ({ tipo: 'vatios' } & Rango)
  | ({ tipo: 'rpe' } & Rango)
  | ({ tipo: 'rir' } & Rango)
  | ({ tipo: 'kg' } & Rango)
  | ({ tipo: 'pct_rm' } & Rango)
  | ({ tipo: 'calorias' } & Rango)
  | { tipo: 'tiempo_tope'; max: number }
  | { tipo: 'peso_corporal' }
  | { tipo: 'relativo' };

/** value | min/max → un rango; un punto es [v, v]. Null si no dice nada. */
function rangoDe(value: number | undefined, min: number | undefined, max: number | undefined): Rango | null {
  if (value != null) return { min: value, max: value };
  if (min == null && max == null) return null;
  return { min: min ?? null, max: max ?? null };
}

const MAQUINAS: ReadonlySet<string> = new Set(['row', 'ski', 'bike']);
const MODALIDADES_ZONA_RITMO: ReadonlySet<string> = new Set(['run', 'row', 'ski', 'bike']);

function zonaEntre(a: number | undefined, b: number | undefined): { desde: number; hasta: number } | null {
  const lo = a ?? b;
  const hi = b ?? a;
  if (lo == null || hi == null) return null;
  return { desde: Math.round(Math.min(lo, hi)), hasta: Math.round(Math.max(lo, hi)) };
}

/** El objetivo de una línea plana (`Target`), en el idioma del cumplimiento. */
export function objetivoDeTarget(t: Target | undefined, modalidad: string | null): ObjetivoTramo | null {
  if (!t) return null;
  switch (t.kind) {
    case 'pace': {
      const r = rangoDe(t.value_s, t.min_s, t.max_s);
      return r ? { tipo: 'ritmo', unidad: t.unit, ...r } : null;
    }
    case 'hr_zone': {
      const z = t.value != null ? { desde: Math.round(t.value), hasta: Math.round(t.value) } : zonaEntre(t.min, t.max);
      if (!z) return null;
      return MODALIDADES_ZONA_RITMO.has(modalidad ?? '') ? { tipo: 'zona_ritmo', ...z } : { tipo: 'zona_pulso', ...z };
    }
    case 'hr_bpm': {
      const r = rangoDe(t.value, t.min, t.max);
      return r ? { tipo: 'pulso', ...r } : null;
    }
    case 'watts': {
      const r = rangoDe(t.value, t.min, t.max);
      return r ? { tipo: 'vatios', ...r } : null;
    }
    case 'rpe': {
      const r = rangoDe(t.value, t.min, t.max);
      return r ? { tipo: 'rpe', ...r } : null;
    }
    case 'rir': {
      const r = rangoDe(t.value, t.min, t.max);
      return r ? { tipo: 'rir', ...r } : null;
    }
    case 'kg': {
      const r = rangoDe(t.value, t.min, t.max);
      return r ? { tipo: 'kg', ...r } : null;
    }
    case 'percent_rm': {
      const r = rangoDe(t.value, t.min, t.max);
      return r ? { tipo: 'pct_rm', ...r } : null;
    }
    case 'calories': {
      const r = rangoDe(t.value, t.min, t.max);
      return r ? { tipo: 'calorias', ...r } : null;
    }
    case 'time_cap': {
      const max = t.max_s ?? t.value_s ?? t.min_s;
      return max != null && max > 0 ? { tipo: 'tiempo_tope', max } : null;
    }
    case 'bodyweight':
      return { tipo: 'peso_corporal' };
    case 'relative':
      return { tipo: 'relativo' };
  }
}

/** El objetivo de un tramo de la gramática de carrera (#61). */
export function objetivoDeSegmento(t: SegmentTarget | null): ObjetivoTramo | null {
  if (!t) return null;
  switch (t.type) {
    case 'pace': {
      const r = rangoDe(t.value_s, t.min_s, t.max_s);
      return r ? { tipo: 'ritmo', unidad: 'per_km', ...r } : null;
    }
    case 'pace_zone':
      return { tipo: 'zona_ritmo', desde: t.zone, hasta: t.zone };
    case 'hr_zone':
      return { tipo: 'zona_pulso', desde: t.zone, hasta: t.zone };
    case 'rpe': {
      const r = rangoDe(t.value, t.min, t.max);
      return r ? { tipo: 'rpe', ...r } : null;
    }
  }
}

// ---------------------------------------------------------------------------
// LA BANDA ABSOLUTA
// ---------------------------------------------------------------------------

export interface ContextoBandas {
  anclas: AnclasAtleta;
  /** Las bandas de FC del coach, como fracción del umbral. */
  fracciones_hr: HrZoneFractions;
  /** El modelo de zonas de ritmo del coach (o el estándar), por unidad. */
  zonas_ritmo: Record<ZonePaceUnit, readonly CoachZone[]>;
  metodo: CoachAnalyticsMethod;
  /** La pendiente (|%|) a partir de la cual el ritmo deja de juzgarse (coach_running_thresholds). */
  pendiente_retira_ritmo_pct: number | null;
}

export interface Banda {
  eje: EjeIntensidad;
  /** Borde bajo en la unidad del eje (null = abierto). */
  min: number | null;
  /** Borde alto (null = abierto). */
  max: number | null;
  /** La zona de la que salió, cuando salió de una. */
  zona: { desde: number; hasta: number } | null;
  /** El peldaño del umbral que la sostiene; null si el objetivo ya era absoluto. */
  ancla: Ancla | null;
}

export type ResolucionBanda = { banda: Banda } | { motivo: MotivoSinDato };

const METROS_MILLA = 1609.344;

/** Z6 de ritmo existe; en pulso se resuelve con la banda de Z5 (`HR_ZONE_Z6_FALLBACK`). */
function zonaPulso(n: number): HrZone {
  const z = Math.min(Math.max(1, Math.round(n)), HR_ZONES.length);
  return z as HrZone;
}

function bandaZonaRitmo(desde: number, hasta: number, modalidad: string | null, ctx: ContextoBandas): ResolucionBanda {
  const m = (MODALIDADES_ZONA_RITMO.has(modalidad ?? '') ? modalidad : 'run') as ModalidadRitmo;
  const umbral = ctx.anclas.ritmo[m];
  if (!umbral || !anclaCuenta(umbral.ancla) || !(umbral.valor > 0)) return { motivo: 'sin_ancla' };
  const unidad: ZonePaceUnit = m === 'run' ? 'per_km' : 'per_500m';
  let banda: { fast_s: number; slow_s: number | null } | null = null;
  try {
    const zonas = resolveZonesForAthlete({ modality: m, threshold_s: umbral.valor, pace_unit: unidad }, [...ctx.zonas_ritmo[unidad]]);
    banda = resolvePaceBandFromZones(zonas, { min: desde, max: hasta }, unidad);
  } catch {
    // Un modelo de zonas del coach roto (no son seis, unidad cruzada): la banda
    // no se puede resolver, y eso se dice — nunca se rellena con el estándar.
    return { motivo: 'sin_ancla' };
  }
  if (!banda) return { motivo: 'sin_ancla' };
  return {
    banda: { eje: m === 'run' ? 'ritmo' : 'split', min: banda.fast_s, max: banda.slow_s, zona: { desde, hasta }, ancla: umbral.ancla },
  };
}

function bandaZonaPulso(desde: number, hasta: number, ctx: ContextoBandas): ResolucionBanda {
  const umbral = ctx.anclas.pulso;
  if (!umbral || !anclaCuenta(umbral.ancla) || !(umbral.valor > 0)) return { motivo: 'sin_ancla' };
  const lo = zonaPulso(desde);
  const hi = zonaPulso(hasta);
  // Z1 no tiene suelo en el modelo: cualquier pulso por debajo de Z2 es recuperación.
  const min = lo === 1 ? null : Math.round(umbral.valor * ctx.fracciones_hr[lo].lo);
  const max = Math.round(umbral.valor * ctx.fracciones_hr[hi].hi);
  return { banda: { eje: 'pulso', min, max, zona: { desde, hasta }, ancla: umbral.ancla } };
}

/**
 * La banda de INTENSIDAD de un objetivo, para un tramo de esa modalidad. Null
 * cuando el objetivo no es de intensidad (calorías como meta, un tope de tiempo,
 * el peso corporal): esos se juzgan en su propia pregunta, o no se juzgan.
 */
export function resolverBanda(o: ObjetivoTramo, modalidad: string | null, ctx: ContextoBandas): ResolucionBanda | null {
  const maquina = MAQUINAS.has(modalidad ?? '');
  switch (o.tipo) {
    case 'ritmo': {
      // Todo ritmo se lleva a la unidad del aparato: s/km al correr, s/500 m en
      // una máquina (como el vivo, que enseña el split aunque el coach escriba por km).
      const aKm = (s: number | null) => (s == null ? null : o.unidad === 'per_mile' ? s / (METROS_MILLA / 1000) : o.unidad === 'per_500m' ? s * 2 : s);
      const a500 = (s: number | null) => (s == null ? null : o.unidad === 'per_500m' ? s : (aKm(s) as number) / 2);
      return maquina
        ? { banda: { eje: 'split', min: a500(o.min), max: a500(o.max), zona: null, ancla: null } }
        : { banda: { eje: 'ritmo', min: aKm(o.min), max: aKm(o.max), zona: null, ancla: null } };
    }
    case 'zona_ritmo':
      return bandaZonaRitmo(o.desde, o.hasta, modalidad, ctx);
    case 'zona_pulso':
      return bandaZonaPulso(o.desde, o.hasta, ctx);
    case 'pulso':
      return { banda: { eje: 'pulso', min: o.min, max: o.max, zona: null, ancla: null } };
    case 'vatios':
      return { banda: { eje: 'vatios', min: o.min, max: o.max, zona: null, ancla: null } };
    case 'rpe':
      return { banda: { eje: 'rpe', min: o.min, max: o.max, zona: null, ancla: null } };
    case 'rir':
      return { banda: { eje: 'rir', min: o.min, max: o.max, zona: null, ancla: null } };
    case 'kg':
      return { banda: { eje: 'carga', min: o.min, max: o.max, zona: null, ancla: null } };
    case 'pct_rm':
      return { motivo: 'sin_1rm' };
    case 'relativo':
      return { motivo: 'relativo' };
    case 'calorias':
    case 'tiempo_tope':
    case 'peso_corporal':
      return null;
  }
}

/** La holgura del coach para un eje, en la unidad del eje. La carga es relativa a lo prescrito. */
export function holguraDe(eje: EjeIntensidad, m: CoachAnalyticsMethod, banda: Pick<Banda, 'min' | 'max'>): number {
  switch (eje) {
    case 'ritmo':
      return m.holgura_ritmo_s_km;
    case 'split':
      return m.holgura_split_s_500m;
    case 'vatios':
      return m.holgura_vatios_w;
    case 'pulso':
      return m.holgura_pulso_ppm;
    case 'rpe':
      return m.holgura_rpe;
    case 'rir':
      return m.holgura_rir;
    case 'carga':
      return ((banda.max ?? banda.min ?? 0) * m.holgura_carga_pct) / 100;
  }
}

// ---------------------------------------------------------------------------
// EL JUICIO
// ---------------------------------------------------------------------------

const DE_RUN: Record<RunComplianceVerdict, VeredictoCumplimiento> = {
  dentro: 'dentro',
  fuera_rapido: 'por_encima',
  fuera_lento: 'por_debajo',
  sin_dato: 'sin_dato',
};

/**
 * Un valor contra una banda de su eje, con la holgura: la comparación del vivo
 * (`juzgarContraBanda`). `delta` es la distancia al borde más cercano de la banda
 * SIN holgura, en la unidad del eje y con signo (+ = por encima del borde alto):
 * «se fue 6 s/km», «4 ppm por encima». Cero dentro.
 */
export function juzgarEje(
  eje: EjeCumplimiento,
  valor: number | null | undefined,
  min: number | null,
  max: number | null,
  holgura: number,
): { veredicto: VeredictoCumplimiento; delta: number | null } {
  const v = DE_RUN[juzgarContraBanda({ valor, min, max, inverso: EJES_INVERSOS.has(eje), holgura })];
  if (valor == null || !Number.isFinite(valor) || v === 'sin_dato') return { veredicto: v, delta: null };
  let delta = 0;
  if (min != null && valor < min) delta = valor - min;
  else if (max != null && valor > max) delta = valor - max;
  return { veredicto: v, delta };
}
