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

// Cómo se llama cada categoría delante del coach. Ojo: `cardio` NO es "Carrera" —
// la categoría agrupa remo, ski, bici y carrera (así la reparte `modalityExpr` en
// modalidades), así que llamarla "Carrera" haría que quien crea un "Remo 500m"
// tuviera que elegir "Carrera". El chip de filtro de arriba sigue diciendo
// "Carrera" porque filtra otra cosa: la intención del coach al buscar.
export const EXERCISE_CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  hyrox_station: 'HYROX',
  strength: 'Fuerza',
  cardio: 'Cardio',
  skill: 'Skill',
  plyometric: 'Pliometría',
  core: 'Core',
  mobility: 'Movilidad',
};
