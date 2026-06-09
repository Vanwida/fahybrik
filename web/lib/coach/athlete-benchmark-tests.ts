/**
 * Fase 2+ — Tests oficiales Fabrik post-assign (~semana 1).
 * Ground truth PRs; autodeclarados onboarding = orientativos.
 * Implementación pendiente — ver plan maestro capacidad 9.
 */
export const ATHLETE_BENCHMARK_TESTS_PHASE = 2 as const;

export type BenchmarkTestSlug =
  | 'hyrox_half_sim'
  | '5k_time_trial'
  | '1rm_battery'
  | 'row_2k';

export const FABRIK_BENCHMARK_PROTOCOLS: ReadonlyArray<{
  slug: BenchmarkTestSlug;
  label: string;
  week_offset: number;
}> = [
  { slug: 'hyrox_half_sim', label: 'HYROX half sim', week_offset: 1 },
  { slug: '5k_time_trial', label: '5K control', week_offset: 1 },
  { slug: '1rm_battery', label: 'Batería 1RM', week_offset: 1 },
  { slug: 'row_2k', label: '2K row', week_offset: 1 },
];
