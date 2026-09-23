// De las marcas guardadas de un atleta a la sugerencia de nivel, sobre la
// escalera del COACH (sus niveles activos, en su orden, con sus cortes).
//
// Aquí solo vive el MECANISMO que traduce lo guardado a marcas legibles: qué
// slug de `athlete_benchmarks` es cada marca y cómo se hace relativa al peso la
// sentadilla. Los cortes (dónde se entra a cada nivel) son método del coach y
// viven en `athlete_level_criteria` con su defecto por posición en
// `shared/domain/coach/level-criteria.ts` — ver DECISIONS 2026-09-23 «Qué marca
// abre cada nivel».

import {
  BENCH_BACK_SQUAT_1RM,
  BENCH_HYROX_OPEN,
  BENCH_RUN_5K,
  BENCH_ROW_2K,
} from '@fahybrid/shared/domain/coach/benchmark-slugs';
import {
  suggestLevelOnLadder,
  type AthleteMarks,
  type LevelSuggestion,
  type ResolvedRung,
} from '@fahybrid/shared/domain/coach/level-criteria';

export type Benchmark = {
  exercise_slug: string;
  value: number; // SI: segundos para tiempos, kg para pesos
  unit: string;
};

export type AthleteProfile = {
  sex: 'male' | 'female' | null;
  weight_kg: number | null;
  training_experience_years: number | null;
};

/**
 * Las marcas del atleta en las unidades de los cortes. Un resultado REAL de
 * HYROX (una llegada, importada o registrada) manda sobre el tiempo declarado:
 * es la medida, no una estimación.
 */
export function marksFromBenchmarks(
  benchmarks: readonly Benchmark[],
  profile: AthleteProfile,
  realHyroxSeconds: number | null = null,
): AthleteMarks {
  const find = (slug: string) => benchmarks.find((b) => b.exercise_slug === slug)?.value ?? null;
  const marks: AthleteMarks = {};
  const hyrox = realHyroxSeconds ?? find(BENCH_HYROX_OPEN);
  if (hyrox != null && hyrox > 0) marks.hyrox_s = hyrox;
  const run5k = find(BENCH_RUN_5K);
  if (run5k != null && run5k > 0) marks.run_5k_s = run5k;
  const row2k = find(BENCH_ROW_2K);
  if (row2k != null && row2k > 0) marks.row_2k_s = row2k;
  const squat = find(BENCH_BACK_SQUAT_1RM);
  if (squat != null && squat > 0 && profile.weight_kg != null && profile.weight_kg > 0) {
    marks.squat_bw = squat / profile.weight_kg;
  }
  if (profile.training_experience_years != null && profile.training_experience_years >= 0) {
    marks.experience_years = profile.training_experience_years;
  }
  return marks;
}

/**
 * La sugerencia para un atleta. Con un resultado real de HYROX, esa marca sola
 * decide (confianza alta): no se promedia un indicio con la medida de verdad.
 */
export function suggestLevelForAthlete(params: {
  ladder: ResolvedRung[];
  benchmarks: readonly Benchmark[];
  profile: AthleteProfile;
  realHyroxSeconds?: number | null;
}): LevelSuggestion {
  const real = params.realHyroxSeconds ?? null;
  if (real != null && real > 0) {
    const s = suggestLevelOnLadder(params.ladder, { hyrox_s: real }, params.profile.sex);
    if (s.status === 'suggested') return { ...s, confidence: 'high' };
    // Si la escalera no lee HYROX, se sigue con el resto de marcas.
  }
  return suggestLevelOnLadder(
    params.ladder,
    marksFromBenchmarks(params.benchmarks, params.profile, null),
    params.profile.sex,
  );
}
