import type { CatalogExercise } from '@/lib/dashboard/exercises/types';

export function defaultParamsForExercise(exercise: CatalogExercise): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const metrics = exercise.default_metrics_json ?? {};

  if (metrics.sets) params.sets = 3;
  if (metrics.reps) params.reps = 8;
  if (metrics.distance_meters) params.distance_meters = 500;
  if (metrics.duration_seconds) params.duration_seconds = 60;
  if (metrics.load_pct) params.load_pct = 70;
  if (metrics.rest_seconds) params.rest_seconds = 90;
  if (metrics.rpe) params.rpe = 7;

  if (Object.keys(params).length === 0) {
    params.sets = 3;
    params.reps = 8;
  }

  return params;
}
