/**
 * Semáforo de velocidad de subida (fase 3).
 *
 * El color es de VELOCIDAD, no de %1RM. El atleta interpreta el RM;
 * la app solo dice si la barra va rápida / media / lenta / muy lenta.
 *
 * Los cortes son método del coach (editables). Estos defaults son el
 * comportamiento si no toca nada — no cablean una escuela.
 */

export type VelocityBand = 'green' | 'yellow' | 'orange' | 'red' | 'none';

/** Defectos en m/s de la concéntrica (última rep o media). */
export type VelocityBandCuts = {
  /** >= greenMin → green */
  greenMin: number;
  /** >= yellowMin → yellow */
  yellowMin: number;
  /** >= orangeMin → orange; below → red */
  orangeMin: number;
};

/** Defectos sensatos para sentadilla a carga de trabajo (no cerca del 1RM). */
export const DEFAULT_VELOCITY_BAND_CUTS: VelocityBandCuts = {
  greenMin: 0.55,
  yellowMin: 0.4,
  orangeMin: 0.25,
};

/**
 * Banda a partir de m/s absolutos. Devuelve `none` si no hay dato o la
 * confianza no llega al mínimo (no pintar rojo con aplomo).
 */
export function velocityBand(
  velocityMs: number | null | undefined,
  confidence: number | null | undefined,
  cuts: VelocityBandCuts = DEFAULT_VELOCITY_BAND_CUTS,
  minConfidence = 0.5,
): VelocityBand {
  if (velocityMs == null || !(velocityMs >= 0)) return 'none';
  if (confidence == null || confidence < minConfidence) return 'none';
  if (velocityMs >= cuts.greenMin) return 'green';
  if (velocityMs >= cuts.yellowMin) return 'yellow';
  if (velocityMs >= cuts.orangeMin) return 'orange';
  return 'red';
}

/**
 * Banda relativa al historial del atleta a esa carga: ratio = actual / media.
 * >0.95 green, >0.85 yellow, >0.75 orange, else red.
 */
export function velocityBandRelative(
  velocityMs: number | null | undefined,
  baselineMs: number | null | undefined,
  confidence: number | null | undefined,
  minConfidence = 0.5,
): VelocityBand {
  if (velocityMs == null || baselineMs == null || !(baselineMs > 0)) return 'none';
  if (confidence == null || confidence < minConfidence) return 'none';
  const ratio = velocityMs / baselineMs;
  if (ratio >= 0.95) return 'green';
  if (ratio >= 0.85) return 'yellow';
  if (ratio >= 0.75) return 'orange';
  return 'red';
}
