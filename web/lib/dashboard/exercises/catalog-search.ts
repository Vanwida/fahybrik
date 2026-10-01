import type { ExerciseCategory } from '@fahybrid/shared/schema/_primitives';
import { matchesQuery, searchIndex } from '@/lib/dashboard/programming/search-key';

/** The same searchable vocabulary in Biblioteca and the workout selector. */
export interface ExerciseSearchRow {
  name: string;
  name_es?: string | null;
  name_en?: string | null;
  override_name?: string | null;
  base_name?: string;
  slug?: string;
  search_terms?: string;
  category: ExerciseCategory;
  equipment: string[];
  archived_at?: string | null;
}

export function exerciseDisplayName(ex: ExerciseSearchRow, locale: string): string {
  // A coach's chosen name is their voice, even when the base has translations.
  if (ex.override_name?.trim()) return ex.override_name;
  const localized = locale.startsWith('en') ? ex.name_en : ex.name_es;
  return localized?.trim() ? localized : ex.name;
}

export function exerciseSearchIndex(ex: ExerciseSearchRow): string {
  return searchIndex([ex.name, ex.base_name, ex.name_es, ex.name_en, ex.slug, ex.search_terms].filter(Boolean).join(' '));
}

/** Available work measures, without inventing a prescribed quantity or side. */
export function exerciseMeasureLabels(metrics: Record<string, boolean>): string[] {
  return [
    ['reps', 'Reps'], ['time', 'Tiempo'], ['distance', 'Distancia'], ['calories', 'Calorías'],
  ].filter(([key]) => metrics[key] === true).map(([, label]) => label);
}

/** Historical material spellings and alternatives are one filter vocabulary. */
export function exerciseEquipmentTokens(equipment: readonly string[]): string[] {
  const alternatives: Record<string, string[]> = {
    band: ['resistance_band'],
    cable_or_band: ['cable', 'resistance_band'],
    band_or_pvc: ['resistance_band', 'pvc_pipe'],
    band_or_pvc_pipe: ['resistance_band', 'pvc_pipe'],
  };
  return [...new Set(equipment.flatMap((token) => alternatives[token] ?? [token]))];
}

export function filterExerciseCatalog<T extends ExerciseSearchRow>(
  rows: readonly T[],
  { query = '', category = 'all', equipment = 'all' }: {
    query?: string;
    category?: ExerciseCategory | 'all';
    equipment?: string;
  } = {},
): T[] {
  return rows.filter((ex) =>
    !ex.archived_at &&
    (category === 'all' || ex.category === category) &&
    (equipment === 'all' || exerciseEquipmentTokens(ex.equipment).includes(equipment)) &&
    matchesQuery(exerciseSearchIndex(ex), query),
  );
}
