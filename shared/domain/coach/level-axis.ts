// @fahybrid/shared/domain/coach/level-axis — cómo llama el coach a su eje de
// clasificación (el «Nivel» de `athlete_levels`).
//
// DECISIONS 2026-08-23: el eje es MECANISMO (valores ordenados con los que se
// agrupan atletas y programas); su NOMBRE es método. Uno agrupa por nivel, otro
// por objetivo, otro por turno. «¿Otro entrenador lo llamaría distinto?» → sí →
// dato en `coaches.level_axis_label` (mig 0223), NULL = este defecto.
//
// Puro y sin base de datos.

/** Lo que ve un coach que no ha tocado nada. */
export const DEFAULT_LEVEL_AXIS_LABEL = 'Nivel';

/** Tope de la etiqueta (la columna lo comprueba igual con un CHECK). */
export const LEVEL_AXIS_LABEL_MAX = 24;

/** La etiqueta efectiva: la del coach o, sin ella, el defecto. */
export function effectiveLevelAxisLabel(stored: string | null | undefined): string {
  const t = (stored ?? '').trim();
  return t.length > 0 ? t : DEFAULT_LEVEL_AXIS_LABEL;
}

/**
 * Normaliza lo que escribe el coach antes de guardarlo: recorta, colapsa
 * espacios y convierte el vacío (o el mismo defecto) en NULL, para que «volver
 * al defecto» y «no haberlo tocado nunca» sean el mismo estado.
 */
export function normalizeLevelAxisLabel(raw: string | null | undefined): string | null {
  const t = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (t.length === 0 || t === DEFAULT_LEVEL_AXIS_LABEL) return null;
  return t;
}
