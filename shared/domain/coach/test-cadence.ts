// @fahybrid/shared/domain/coach/test-cadence — cada cuánto repite un coach un
// test de calibración («volver a medir en 6 semanas»).
//
// Es MÉTODO (HARD RULE Nº0): otro entrenador re-testea cada 4, 8 o 10 semanas.
// Aquí vive el DEFECTO del producto y la regla para leer lo que guarde el coach
// (cuando exista su dato; hasta entonces, todos ven el defecto). El mecanismo
// —programar la repetición N semanas después— está en `lib/coach/apply-test.ts`.
//
// Puro y sin base de datos.

/** Las repeticiones que ofrece «Aplicar test» a un coach que no ha tocado nada. */
export const DEFAULT_TEST_RETEST_WEEKS: readonly number[] = [6, 12];

/** Tope de semanas de una repetición (el mismo que valida la API de aplicar). */
export const TEST_RETEST_WEEKS_MAX = 52;

/** Cuántas opciones enseña el selector como mucho. */
export const TEST_RETEST_OPTIONS_MAX = 4;

/**
 * Las semanas efectivas: las del coach (enteros 1–52, sin repetir, ordenadas,
 * como mucho 4) o, si no hay ninguna válida, el defecto.
 */
export function effectiveTestRetestWeeks(stored: ReadonlyArray<number> | null | undefined): number[] {
  const clean = [...new Set((stored ?? []).filter((w) => Number.isInteger(w) && w >= 1 && w <= TEST_RETEST_WEEKS_MAX))]
    .sort((a, b) => a - b)
    .slice(0, TEST_RETEST_OPTIONS_MAX);
  return clean.length > 0 ? clean : [...DEFAULT_TEST_RETEST_WEEKS];
}

/** Las opciones del selector: «No repetir» y «En N semanas» por cada una. */
export function testRetestOptions(weeks: ReadonlyArray<number>): Array<{ label: string; weeks: number }> {
  return [
    { label: 'No repetir', weeks: 0 },
    ...weeks.map((w) => ({ label: `En ${w} ${w === 1 ? 'semana' : 'semanas'}`, weeks: w })),
  ];
}
