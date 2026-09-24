// @fahybrid/shared/domain/coach/readiness-evidence — cómo se DICE un readiness
// frente a su base. UNA frase para Hoy, el vistazo, el roster y la ficha
// (antes: «sin base aún (0 lecturas)» en Hoy y «sin base todavía (menos de 7
// lecturas)» en la ficha, para el mismo valor).
//
//   «38 hoy · aún sin su base (1 de 7 lecturas)»
//   «31 hoy · −39 vs su base 70 (28 d)»
//
// La base (mediana de las lecturas de los 28 días anteriores, con un mínimo de
// lecturas) es estadística, no método: sus dos números viven aquí para que la
// frase y el cálculo (`web/lib/coach/attention/readiness-baseline.ts`) no puedan
// divergir.
//
// Puro y sin base de datos.

import { relativeDay } from './athlete-state';

/** Ventana de la base, en días anteriores a la lectura. */
export const READINESS_BASELINE_WINDOW_DAYS = 28;
/** Lecturas previas mínimas para que exista base: con menos, «su normal» no se sabe. */
export const READINESS_BASELINE_MIN_READINGS = 7;

export interface ReadinessBaseInput {
  value: number;
  /** Su base, o null si aún no la tiene. */
  baseline: number | null;
  /** Lecturas previas con las que se calcula (o se calculará) la base. */
  baseline_readings: number;
}

/**
 * Solo la parte de la base: «−39 vs su base 70 (28 d)», «igual que su base 70
 * (28 d)» o «aún sin su base (1 de 7 lecturas)».
 */
export function readinessBaseText(r: ReadinessBaseInput): string {
  if (r.baseline == null) {
    const n = Math.max(0, Math.min(r.baseline_readings, READINESS_BASELINE_MIN_READINGS - 1));
    return `aún sin su base (${n} de ${READINESS_BASELINE_MIN_READINGS} lecturas)`;
  }
  const d = r.value - r.baseline;
  const window = `(${READINESS_BASELINE_WINDOW_DAYS} d)`;
  if (d === 0) return `igual que su base ${r.baseline} ${window}`;
  return `${d > 0 ? '+' : '−'}${Math.abs(d)} vs su base ${r.baseline} ${window}`;
}

/** «38 hoy», «38 ayer», «38 el 20 sept». */
export function readinessValueWhen(value: number, observed_on: string, today: string): string {
  const when = relativeDay(observed_on, today);
  return when === 'hoy' || when === 'ayer' ? `${value} ${when}` : `${value} el ${when}`;
}

/** LA frase: valor con su fecha y su base. «38 hoy · aún sin su base (1 de 7 lecturas)». */
export function readinessEvidence(
  r: ReadinessBaseInput & { observed_on: string; today: string },
): string {
  return `${readinessValueWhen(r.value, r.observed_on, r.today)} · ${readinessBaseText(r)}`;
}
