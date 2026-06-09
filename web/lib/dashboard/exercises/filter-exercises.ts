import { EXERCISE_FILTER_CHIPS } from '@/lib/dashboard/exercises/filter-chips';
import type { CatalogExercise, ExerciseFilterChipId } from '@/lib/dashboard/exercises/types';
import type { ExerciseCategory } from '@fahybrid/shared/schema/_primitives';

export interface ExerciseFilterQuery {
  search: string;
  chip: ExerciseFilterChipId;
  categories?: ExerciseCategory[] | null;
}

function matchesSearch(exercise: CatalogExercise, term: string): boolean {
  if (!term) return true;
  const q = term.toLowerCase();
  if (exercise.name.toLowerCase().includes(q)) return true;
  if (exercise.slug.toLowerCase().includes(q)) return true;
  if (exercise.primary_muscle_groups.some((m) => m.toLowerCase().includes(q))) return true;
  if (exercise.equipment.some((e) => e.toLowerCase().includes(q))) return true;
  return false;
}

function matchesChip(exercise: CatalogExercise, chip: ExerciseFilterChipId): boolean {
  if (chip === 'all') return true;
  const chipDef = EXERCISE_FILTER_CHIPS.find((c) => c.id === chip);
  if (!chipDef) return true;
  if (chipDef.match) return chipDef.match(exercise);
  return exercise.category === chip;
}

export function filterExercises(
  catalog: CatalogExercise[],
  query: ExerciseFilterQuery,
): CatalogExercise[] {
  return catalog.filter((exercise) => {
    if (query.categories?.length && !query.categories.includes(exercise.category)) return false;
    if (!matchesChip(exercise, query.chip)) return false;
    return matchesSearch(exercise, query.search.trim());
  });
}
