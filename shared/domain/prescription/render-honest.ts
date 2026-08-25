// Copy honesta cuando el cable trae una medida o un formato que no sabemos leer.
// Espejo de `PrescriptionRenderer.measureWork(.unknown)` y de
// `PrescriptionScheme.unknown` en iOS. Un kind/scheme ausente no es lo mismo:
// eso se calla (§7). Uno que no reconocemos también se calla.

import { normalizeFormat } from './format';

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
  return null;
}

export function honestSchemeCopy(_raw?: string | null): string | null {
  return null;
}

export function schemeInventaSetTable(raw: string | null | undefined): boolean {
  const n = normalizeFormat(raw);
  return n === 'sets' || n === 'superset';
}
