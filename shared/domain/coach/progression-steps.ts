// @fahybrid/shared/domain/coach/progression-steps — los PASOS de «Progresar
// selección…» en el editor de programas (mig 0237).
//
// El mecanismo (cómo se sube una carga, se añade una serie o se descarga un
// volumen) vive en web/lib/dashboard/programming/progress-ops.ts. Cuánto sube
// cada paso es MÉTODO del coach (HARD RULE Nº0): aquí están los defectos, y un
// coach que no toca nada ve estos valores.

export const DEFAULT_PROGRESSION_LOAD_STEP_PCT = 2.5;
export const DEFAULT_PROGRESSION_SETS_STEP = 1;
export const DEFAULT_DELOAD_VOLUME_PCT = 30;

/** Barreras de cordura del sistema (las mismas que el CHECK de la 0237). */
export const PROGRESSION_LOAD_STEP_MAX = 20;
export const PROGRESSION_SETS_STEP_MAX = 5;
export const DELOAD_VOLUME_MIN = 5;
export const DELOAD_VOLUME_MAX = 80;

export interface ProgressionSteps {
  load_step_pct: number;
  sets_step: number;
  deload_volume_pct: number;
}

/** Lo guardado (NULL = sin tocar) → los pasos efectivos. */
export function resolveProgressionSteps(row: {
  progression_load_step_pct: number | string | null;
  progression_sets_step: number | null;
  deload_volume_pct: number | null;
}): ProgressionSteps {
  return {
    load_step_pct:
      row.progression_load_step_pct == null ? DEFAULT_PROGRESSION_LOAD_STEP_PCT : Number(row.progression_load_step_pct),
    sets_step: row.progression_sets_step ?? DEFAULT_PROGRESSION_SETS_STEP,
    deload_volume_pct: row.deload_volume_pct ?? DEFAULT_DELOAD_VOLUME_PCT,
  };
}
