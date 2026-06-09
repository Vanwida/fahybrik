import type { ExerciseCategory } from '@fahybrid/shared/schema/_primitives';

export interface CatalogExercise {
  id: string;
  slug: string;
  name: string;
  category: ExerciseCategory;
  primary_muscle_groups: string[];
  equipment: string[];
  default_metrics_json: Record<string, boolean>;
  hyrox_station_position: number | null;
  description: string | null;
  cues: string | null;
  video_url: string | null;
}

export type ExerciseFilterChipId = 'all' | ExerciseCategory | string;
