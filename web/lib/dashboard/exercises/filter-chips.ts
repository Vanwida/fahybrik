import type { ExerciseCategory } from '@fahybrid/shared/schema/_primitives';
import type { CatalogExercise, ExerciseFilterChipId } from '@/lib/dashboard/exercises/types';

export interface ExerciseFilterChip {
  id: ExerciseFilterChipId;
  label: string;
  match?: (exercise: CatalogExercise) => boolean;
}

export const EXERCISE_FILTER_CHIPS: ExerciseFilterChip[] = [
  { id: 'all', label: 'Todos' },
  { id: 'hyrox_station', label: 'HYROX' },
  { id: 'strength', label: 'Fuerza' },
  { id: 'cardio', label: 'Carrera' },
  { id: 'stations', label: 'Estaciones', match: (ex) => ex.hyrox_station_position != null },
  {
    id: 'sled',
    label: 'Sled',
    match: (ex) => /sled|trineo/i.test(ex.name) || /sled/i.test(ex.slug),
  },
  {
    id: 'wall_ball',
    label: 'Wall ball',
    match: (ex) => /wall ball|wallball/i.test(ex.name),
  },
  {
    id: 'row',
    label: 'Remo',
    match: (ex) => /\brow\b|remo/i.test(ex.name) || /row/i.test(ex.slug),
  },
  {
    id: 'ski',
    label: 'Ski',
    match: (ex) => /ski/i.test(ex.name) || /ski/i.test(ex.slug),
  },
  {
    id: 'burpee',
    label: 'Burpee',
    match: (ex) => /burpee|bbj/i.test(ex.name),
  },
];

export const EXERCISE_CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  hyrox_station: 'HYROX',
  strength: 'Fuerza',
  cardio: 'Carrera',
  skill: 'Skill',
  plyometric: 'Pliometría',
  core: 'Core',
  mobility: 'Movilidad',
};
