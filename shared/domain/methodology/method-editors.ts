// @fahybrid/shared/domain/methodology/method-editors — lo que aceptan los
// editores de Ajustes › Método para el método que ya era dato del coach pero no
// tenía pantalla (revisión pre-FLEXR): las bandas de FC y el reparto que
// persigue (`coach_hr_method`), los umbrales de las lecturas de carrera
// (`coach_running_thresholds`) y sus zonas de ritmo (`methodology_zones`).
//
// Las mismas reglas que los CHECK de cada tabla, dichas en castellano para que
// el coach sepa qué corregir. Los defectos NO viven aquí: siguen en su módulo
// (hr-method.ts, running-thresholds.ts, zones.ts).
//
// Puro (zod), compartido por las rutas y el cliente.

import { z } from 'zod';
import type { CoachHrMethod } from '../coach/hr-method';
import {
  COACH_RUNNING_THRESHOLD_KEYS,
  RUNNING_THRESHOLD_FRESHNESS_ALERT_MAX,
  RUNNING_THRESHOLD_FRESHNESS_ALERT_MIN,
  RUNNING_THRESHOLD_GOOD_IN_BAND_MAX,
  RUNNING_THRESHOLD_GOOD_IN_BAND_MIN,
  RUNNING_THRESHOLD_GRADIENT_RETIRES_MAX,
  RUNNING_THRESHOLD_GRADIENT_RETIRES_MIN,
  RUNNING_THRESHOLD_MEANINGFUL_GAIN_MAX,
  RUNNING_THRESHOLD_MEANINGFUL_GAIN_MIN,
  RUNNING_THRESHOLD_MIN_PAIRS_MAX,
  RUNNING_THRESHOLD_MIN_PAIRS_MIN,
  RUNNING_THRESHOLD_MIN_REPS_PER_POSITION_MAX,
  RUNNING_THRESHOLD_MIN_REPS_PER_POSITION_MIN,
  RUNNING_THRESHOLD_MIN_REPS_TO_JUDGE_MAX,
  RUNNING_THRESHOLD_MIN_REPS_TO_JUDGE_MIN,
  RUNNING_THRESHOLD_MIN_SERIES_MAX,
  RUNNING_THRESHOLD_MIN_SERIES_MIN,
  RUNNING_THRESHOLD_MIN_WEEKS_MAX,
  RUNNING_THRESHOLD_MIN_WEEKS_MIN,
  RUNNING_THRESHOLD_REFERENCE_ZONE_MAX,
  RUNNING_THRESHOLD_REFERENCE_ZONE_MIN,
  RUNNING_THRESHOLD_SAME_HR_MIN_DISTANCE_MAX,
  RUNNING_THRESHOLD_SAME_HR_MIN_DISTANCE_MIN,
  RUNNING_THRESHOLD_SAME_HR_TOLERANCE_MAX,
  RUNNING_THRESHOLD_SAME_HR_TOLERANCE_MIN,
  RUNNING_THRESHOLD_VOLUME_SURGE_MAX,
  RUNNING_THRESHOLD_VOLUME_SURGE_MIN,
  type CoachRunningThresholds,
} from '../coach/running-thresholds';
import { ZONE_ROLES, type ZonePaceUnit } from './zone-model';

// ── Bandas de FC ─────────────────────────────────────────────────────────────

/** Qué no puede pasar con las bandas: huecos al revés, solapes, un reparto que no suma 100. */
export function hrMethodProblem(m: CoachHrMethod): string | null {
  const bands: Array<[number, number]> = [
    [0, m.z1_hi_frac],
    [m.z2_lo_frac, m.z2_hi_frac],
    [m.z3_lo_frac, m.z3_hi_frac],
    [m.z4_lo_frac, m.z4_hi_frac],
    [m.z5_lo_frac, m.z5_hi_frac],
  ];
  for (let i = 1; i < bands.length; i++) {
    const [lo, hi] = bands[i]!;
    if (lo > hi) return `Z${i + 1}: el «desde» no puede pasar del «hasta».`;
    if (lo <= bands[i - 1]![1]) return `Z${i + 1} tiene que empezar por encima de donde acaba Z${i}.`;
  }
  if (m.z1_hi_frac <= 0) return 'Z1 tiene que acabar por encima de 0.';
  if (m.z5_hi_frac > 2) return 'Z5 no puede pasar del 200 % del umbral.';
  if (m.polarization_low_max_zone >= m.polarization_mid_max_zone) {
    return 'La zona fácil tiene que acabar antes que la media.';
  }
  if (m.polarization_low_pct + m.polarization_mid_pct + m.polarization_high_pct !== 100) {
    return 'El reparto tiene que sumar 100.';
  }
  return null;
}

const frac = z.number().min(0).max(2);
const pct = z.number().int().min(0).max(100);

export const hrMethodSchema = z
  .object({
    z1_hi_frac: frac,
    z2_lo_frac: frac,
    z2_hi_frac: frac,
    z3_lo_frac: frac,
    z3_hi_frac: frac,
    z4_lo_frac: frac,
    z4_hi_frac: frac,
    z5_lo_frac: frac,
    z5_hi_frac: frac,
    polarization_low_max_zone: z.number().int().min(1).max(3),
    polarization_mid_max_zone: z.number().int().min(2).max(4),
    polarization_low_pct: pct,
    polarization_mid_pct: pct,
    polarization_high_pct: pct,
  })
  .strict()
  .superRefine((m, ctx) => {
    const problem = hrMethodProblem(m);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  });

/** PUT del método de FC: el conjunto entero, o `null` para volver a los defectos. */
export const hrMethodPutSchema = z.object({ method: hrMethodSchema.nullable() }).strict();

// ── Umbrales de las lecturas de carrera ──────────────────────────────────────

type RunKey = keyof CoachRunningThresholds;

/** Límites de cada umbral (los mismos que los CHECK de 0183/0184/0187). */
export const RUNNING_THRESHOLD_BOUNDS: Record<RunKey, { min: number; max: number; int: boolean }> = {
  min_reps_per_position: { min: RUNNING_THRESHOLD_MIN_REPS_PER_POSITION_MIN, max: RUNNING_THRESHOLD_MIN_REPS_PER_POSITION_MAX, int: true },
  min_series_for_calibration: { min: RUNNING_THRESHOLD_MIN_SERIES_MIN, max: RUNNING_THRESHOLD_MIN_SERIES_MAX, int: true },
  freshness_alert_tsb: { min: RUNNING_THRESHOLD_FRESHNESS_ALERT_MIN, max: RUNNING_THRESHOLD_FRESHNESS_ALERT_MAX, int: true },
  min_pairs_for_compromised_trend: { min: RUNNING_THRESHOLD_MIN_PAIRS_MIN, max: RUNNING_THRESHOLD_MIN_PAIRS_MAX, int: true },
  min_weeks_to_judge: { min: RUNNING_THRESHOLD_MIN_WEEKS_MIN, max: RUNNING_THRESHOLD_MIN_WEEKS_MAX, int: true },
  meaningful_gain_s_per_km: { min: RUNNING_THRESHOLD_MEANINGFUL_GAIN_MIN, max: RUNNING_THRESHOLD_MEANINGFUL_GAIN_MAX, int: true },
  volume_surge_ratio: { min: RUNNING_THRESHOLD_VOLUME_SURGE_MIN, max: RUNNING_THRESHOLD_VOLUME_SURGE_MAX, int: false },
  good_in_band_pct: { min: RUNNING_THRESHOLD_GOOD_IN_BAND_MIN, max: RUNNING_THRESHOLD_GOOD_IN_BAND_MAX, int: true },
  min_reps_to_judge_band: { min: RUNNING_THRESHOLD_MIN_REPS_TO_JUDGE_MIN, max: RUNNING_THRESHOLD_MIN_REPS_TO_JUDGE_MAX, int: true },
  same_hr_reference_zone: { min: RUNNING_THRESHOLD_REFERENCE_ZONE_MIN, max: RUNNING_THRESHOLD_REFERENCE_ZONE_MAX, int: true },
  same_hr_tolerance_bpm: { min: RUNNING_THRESHOLD_SAME_HR_TOLERANCE_MIN, max: RUNNING_THRESHOLD_SAME_HR_TOLERANCE_MAX, int: true },
  same_hr_min_distance_m: { min: RUNNING_THRESHOLD_SAME_HR_MIN_DISTANCE_MIN, max: RUNNING_THRESHOLD_SAME_HR_MIN_DISTANCE_MAX, int: true },
  gradient_retires_pace_pct: { min: RUNNING_THRESHOLD_GRADIENT_RETIRES_MIN, max: RUNNING_THRESHOLD_GRADIENT_RETIRES_MAX, int: false },
};

/**
 * PUT de los umbrales de carrera: las claves que cambian; `null` = volver al
 * defecto de esa clave. El servidor mezcla con lo vigente y guarda el conjunto
 * entero (la tabla es NOT NULL por columna).
 */
export const runningThresholdsPatchSchema = z
  .record(z.string(), z.number().nullable())
  .superRefine((body, ctx) => {
    const keys = Object.keys(body);
    if (keys.length === 0) ctx.addIssue({ code: 'custom', message: 'No hay nada que cambiar.' });
    for (const k of keys) {
      if (!(COACH_RUNNING_THRESHOLD_KEYS as string[]).includes(k)) {
        ctx.addIssue({ code: 'custom', message: `Umbral desconocido: ${k}.` });
        continue;
      }
      const v = body[k];
      if (v == null) continue;
      const b = RUNNING_THRESHOLD_BOUNDS[k as RunKey];
      if (v < b.min || v > b.max || (b.int && !Number.isInteger(v))) {
        ctx.addIssue({ code: 'custom', message: `Entre ${b.min} y ${b.max}${b.int ? ', sin decimales' : ''}.`, path: [k] });
      }
    }
  })
  .transform((b) => b as Partial<Record<RunKey, number | null>>);

// ── Zonas de ritmo ───────────────────────────────────────────────────────────

/** Una zona de ritmo tal como la edita el coach (la identidad y el color son fijos). */
export interface PaceZoneEdit {
  label: string;
  /** Borde RÁPIDO en segundos respecto al umbral (negativo = más rápido). */
  low_offset_s: number;
  /** Borde LENTO; null solo en la zona más suave (sin techo). */
  high_offset_s: number | null;
}

/**
 * Qué no puede pasar en un modelo de ritmo: seis zonas de la más suave a la más
 * dura, cada banda con su borde rápido antes que el lento, sin solaparse con la
 * siguiente, la más suave sin techo, y la zona de umbral empezando EN el umbral
 * (el resultado del test es su borde rápido: es la definición del ancla, no una
 * opinión).
 */
export function paceZonesProblem(zones: readonly PaceZoneEdit[]): string | null {
  if (zones.length !== ZONE_ROLES.length) return `Son ${ZONE_ROLES.length} zonas.`;
  const thresholdIdx = ZONE_ROLES.indexOf('threshold');
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i]!;
    const code = `Z${i + 1}`;
    if (z.label.trim().length === 0) return `${code}: ponle un nombre.`;
    if (i === 0) {
      if (z.high_offset_s != null) return 'Z1 no tiene techo: es todo lo que va más suave.';
    } else if (z.high_offset_s == null) {
      return `${code}: falta el borde lento.`;
    } else if (z.low_offset_s > z.high_offset_s) {
      return `${code}: el borde rápido tiene que ser menor que el lento.`;
    }
    if (i === thresholdIdx && z.low_offset_s !== 0) {
      return `${code} empieza en tu ritmo umbral (0 s): es lo que mide el test.`;
    }
    if (i > 0) {
      const prev = zones[i - 1]!;
      if (z.high_offset_s != null && z.high_offset_s >= prev.low_offset_s) {
        return `${code} tiene que ir más rápida que Z${i}: su borde lento, por debajo del rápido de Z${i}.`;
      }
    }
  }
  return null;
}

const paceZoneEditSchema = z
  .object({
    label: z.string().transform((s) => s.trim()).pipe(z.string().min(1).max(40)),
    low_offset_s: z.number().int().min(-300).max(600),
    high_offset_s: z.number().int().min(-300).max(600).nullable(),
  })
  .strict();

/** PUT de un modelo de ritmo: las seis zonas de una unidad, o `null` = volver al estándar. */
export const paceZonesPutSchema = z
  .object({
    pace_unit: z.enum(['per_km', 'per_500m']) as z.ZodType<ZonePaceUnit>,
    zones: z.array(paceZoneEditSchema).nullable(),
  })
  .strict()
  .superRefine((b, ctx) => {
    if (b.zones == null) return;
    const problem = paceZonesProblem(b.zones);
    if (problem) ctx.addIssue({ code: 'custom', message: problem, path: ['zones'] });
  });
