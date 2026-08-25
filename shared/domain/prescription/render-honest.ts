// Copy honesta cuando el cable trae una medida o un formato que no sabemos leer.
// Espejo de `PrescriptionRenderer.measureWork(.unknown)` y de
// `PrescriptionScheme.unknown` en iOS. Un kind/scheme ausente no es lo mismo:
// eso se calla (§7). Uno que no reconocemos se declara.

import { formatMeta, normalizeFormat } from './format';

export const COPY_NO_LO_SE = 'no lo sé';
export const COPY_CIRCUITO = 'circuito';
export const COPY_SEGUIDO = 'seguido';

export type StationOrderLabel =
  | typeof COPY_CIRCUITO
  | typeof COPY_SEGUIDO
  | typeof COPY_NO_LO_SE;

/**
 * Cómo se recorren las estaciones de un bloque. Sale del format/scheme
 * guardado, no del número de estaciones. `circuit` y `rounds` son el
 * mismo miembro del catálogo: rondas de estaciones. Cualquier otro
 * miembro conocido es seguido. Lo que no está en el catálogo no se
 * adivina.
 */
export function stationOrderLabel(
  raw: string | null | undefined,
): StationOrderLabel {
  const n = normalizeFormat(raw);
  if (n == null) return COPY_NO_LO_SE;
  if (n === 'rounds') return COPY_CIRCUITO;
  return COPY_SEGUIDO;
}

/** Un bloque de estaciones (familia metcon, o un format que no sabemos leer). */
export function showsStationOrder(raw: string | null | undefined): boolean {
  if (raw == null || raw === '') return false;
  const meta = formatMeta(raw);
  if (!meta) return true;
  return meta.family === 'metcon';
}

const KNOWN_MEASURE_KIND = new Set([
  'reps',
  'distance',
  'duration',
  'calories',
  'reps_to_failure',
]);

export function honestMeasureCopy(
  m: { kind: string } | null | undefined,
): string | null {
  if (m == null || m.kind === '') return null;
  if (m.kind === 'reps_to_failure') return 'al fallo';
  if (KNOWN_MEASURE_KIND.has(m.kind)) return null;
  return COPY_NO_LO_SE;
}

export function honestSchemeCopy(raw: string | null | undefined): string | null {
  if (raw == null || raw === '') return null;
  return normalizeFormat(raw) ? null : COPY_NO_LO_SE;
}

export function schemeInventaSetTable(raw: string | null | undefined): boolean {
  const n = normalizeFormat(raw);
  return n === 'sets' || n === 'superset';
}
