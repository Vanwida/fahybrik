import type { ExerciseCategory } from '@fahybrid/shared/schema/_primitives';
import type { Modality } from '@fahybrid/shared/domain/prescription';

export interface CatalogExercise {
  id: string;
  slug: string;
  name: string;
  category: ExerciseCategory;
  /** Intrinsic training modality — the source of truth a prescription line
   *  derives its modality from (migration 0053). Always present. */
  modality: Modality;
  primary_muscle_groups: string[];
  equipment: string[];
  default_metrics_json: Record<string, boolean>;
  hyrox_station_position: number | null;
  description: string | null;
  cues: string | null;
  video_url: string | null;
}

export type ExerciseFilterChipId = 'all' | ExerciseCategory | string;
