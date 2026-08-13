// Valores de UNA ocurrencia. El último slug del atleta no es el informe de una fila.

import { BENCH_CMJ, BENCH_CMJ_LOADED } from '@fahybrid/shared/domain/coach/benchmark-slugs';

export interface OccurrenceBench {
  assignment_id: string | null;
  exercise_slug: string;
  value: number;
  recorded_at: string;
}

export interface OccurrenceAttempt {
  assignment_id: string;
  kind: string;
  height_cm: number;
  kept: boolean;
  quality?: string;
  load_kg?: number | null;
  body_mass_kg?: number | null;
}

export function snapshotFromAttempts(
  assignmentId: string,
  attempts: OccurrenceAttempt[],
): { load_kg: number | null; body_mass_kg: number | null } {
  const mine = attempts.filter((a) => a.assignment_id === assignmentId);
  const loaded = mine.find((a) => a.kind === 'loaded_cmj' && a.load_kg != null);
  const withMass = mine.find((a) => a.body_mass_kg != null);
  return {
    load_kg: loaded?.load_kg ?? null,
    body_mass_kg: withMass?.body_mass_kg ?? null,
  };
}

/** Último valor por slug de ESA assignment. Vacío si no hay filas ancladas. */
export function valuesForOccurrence(
  assignmentId: string,
  benches: OccurrenceBench[],
): Map<string, number> {
  const latest = new Map<string, { value: number; recorded_at: string }>();
  for (const row of benches) {
    if (row.assignment_id !== assignmentId) continue;
    const prev = latest.get(row.exercise_slug);
    if (!prev || row.recorded_at > prev.recorded_at) {
      latest.set(row.exercise_slug, { value: row.value, recorded_at: row.recorded_at });
    }
  }
  const out = new Map<string, number>();
  for (const [slug, row] of latest) out.set(slug, row.value);
  return out;
}

/** Si no hay benchmarks anclados, el salto aún tiene intentos por assignment. */
export function heightsFromAttempts(
  assignmentId: string,
  attempts: OccurrenceAttempt[],
): Map<string, number> {
  const kept = attempts.filter((a) => a.assignment_id === assignmentId && a.kept);
  const byKind = new Map<string, number>();
  for (const a of kept) {
    const prev = byKind.get(a.kind);
    if (prev == null || a.height_cm > prev) byKind.set(a.kind, a.height_cm);
  }
  const out = new Map<string, number>();
  const cmj = byKind.get('cmj');
  const loaded = byKind.get('loaded_cmj');
  if (cmj != null) out.set(BENCH_CMJ, cmj);
  if (loaded != null) out.set(BENCH_CMJ_LOADED, loaded);
  return out;
}
