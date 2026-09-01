// Vocabularios cerrados de FIT → nuestro vocabulario cerrado. Dos tablas, cada
// una con su propia lección real detrás — no se tocan por separado sin volver
// a leer el porqué.

import type { SegmentModality } from '@fahybrid/shared/domain/segment-modality';
import type { CanonicalLap } from './canonical';

/**
 * `session.sport` (ya como STRING gracias a `convertTypesToStrings`, nunca el
 * número crudo del perfil — así el mapa no depende de que Garmin reordene el
 * enum en una versión futura del SDK) → `SegmentModality`.
 *
 * `walking` e `hiking` se listan EXPLÍCITOS aunque el resultado coincida con el
 * default: es la lección de la migración 0192 (docs/DECISIONS.md 2026-08-13) —
 * el mapeo de HealthKit los colaba en 'run' y 431 de 667 «carreras» del
 * histórico real eran caminatas a ~17 min/km. Dejarlos aquí a la vista evita
 * que un futuro retoque de este mapa los pierda de vista.
 *
 * Todo lo que no está en la tabla (ciclismo indoor vía `fitnessEquipment`,
 * deportes de raqueta, natación, remo indoor sin `sport=rowing`, etc.) cae al
 * default 'other': el contrato prohíbe abrir un cubo nuevo por cada sport que
 * mande un reloj.
 */
const SPORT_TO_MODALITY: Partial<Record<string, SegmentModality>> = {
  running: 'run',
  walking: 'other',
  hiking: 'other',
  rowing: 'row',
  cycling: 'bike',
  crossCountrySkiing: 'ski',
  training: 'strength',
  hiit: 'strength',
};

export function sportToModality(sport: string | number | undefined): SegmentModality {
  if (typeof sport !== 'string') return 'other';
  return SPORT_TO_MODALITY[sport] ?? 'other';
}

/** `lap.intensity` que el contrato considera "no es un intento real". Todo lo
 *  demás (`active`, `interval`, `other`, o el campo ausente) es 'work'. */
const RECOVERY_INTENSITIES = new Set(['rest', 'recovery', 'warmup', 'cooldown']);

export function intensityToRole(intensity: string | number | undefined): CanonicalLap['role'] {
  if (typeof intensity === 'string' && RECOVERY_INTENSITIES.has(intensity)) return 'recovery';
  return 'work';
}
