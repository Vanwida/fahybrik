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

/**
 * El nombre de un grupo SIN nombre propio, dicho por su regla con el eje del
 * coach: «Nivel N3 · 5 días» (o «Objetivo Sub-60 · 4 días» si así llama él a su
 * eje). null si el grupo no tiene regla. Una sola implementación para la lista
 * de grupos, el roster, el vistazo, la biblioteca y la búsqueda.
 */
export function groupRuleName(g: {
  axis_label?: string | null;
  level_name: string | null;
  days_per_week: number | null;
}): string | null {
  const parts = [
    g.level_name ? `${effectiveLevelAxisLabel(g.axis_label)} ${g.level_name}` : null,
    g.days_per_week != null ? `${g.days_per_week} ${g.days_per_week === 1 ? 'día' : 'días'}` : null,
  ].filter((p): p is string => p != null);
  return parts.length > 0 ? parts.join(' · ') : null;
}
