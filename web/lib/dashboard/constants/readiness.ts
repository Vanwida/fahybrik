// Bandas de readiness — cómo se PINTA un valor 0–100 (bien · cautela · bajo).
//
// Las bandas son MÉTODO del coach (HARD RULE Nº0): viven en
// `coach_signal_thresholds` (`readiness_ok_min`, `readiness_caution_min`, mig
// 0211) con su defecto en `shared/domain/coach/signal-thresholds.ts`. Aquí
// quedan los defectos con nombre para las superficies que aún no reciben los
// del coach, y las funciones aceptan las bandas del coach cuando se las pasan
// (`resolveCoachThresholds`). Pintar una banda NO dispara ninguna señal: eso lo
// decide el motor con la base propia del atleta (lib/coach/attention).
//
// Vocabulario (plan §2): el readiness se dice como número 0–100 SIN «%».

import {
  DEFAULT_COACH_THRESHOLDS,
  readinessBandOf,
  type CoachThresholds,
  type ReadinessBand,
} from '@fahybrid/shared/domain/coach/signal-thresholds';

/** Defecto del sistema: «bien» desde aquí. El del coach: `readiness_ok_min`. */
export const READINESS_OK_MIN = DEFAULT_COACH_THRESHOLDS.readiness_ok_min;
/** Defecto del sistema: «cautela» desde aquí. El del coach: `readiness_caution_min`. */
export const READINESS_CAUTION_MIN = DEFAULT_COACH_THRESHOLDS.readiness_caution_min;

export type ReadinessBucket = ReadinessBand;

export type ReadinessBands = Pick<CoachThresholds, 'readiness_ok_min' | 'readiness_caution_min'>;

export const READINESS_BUCKETS: readonly ReadinessBucket[] = ['ok', 'caution', 'low'];

export function isReadinessBucket(v: string | null | undefined): v is ReadinessBucket {
  return v === 'ok' || v === 'caution' || v === 'low';
}

/** La banda de un valor — con las bandas del coach si se pasan. */
export function readinessBucket(score: number, bands?: ReadinessBands): ReadinessBucket {
  return readinessBandOf(score, bands);
}

/** Etiqueta de cada banda para leyendas y filtros, sin «%» (vocabulario §2). */
export function readinessBucketLabels(
  bands: ReadinessBands = DEFAULT_COACH_THRESHOLDS,
): Record<ReadinessBucket, string> {
  return {
    ok: `Bien (≥ ${bands.readiness_ok_min})`,
    caution: `Cautela (${bands.readiness_caution_min}–${bands.readiness_ok_min - 1})`,
    low: `Bajo (< ${bands.readiness_caution_min})`,
  };
}

/** Las etiquetas con las bandas del sistema (superficies que aún no leen las del coach). */
export const READINESS_BUCKET_LABEL: Record<ReadinessBucket, string> = readinessBucketLabels();
