import type { TemplateFormat } from '@/lib/templates/schema';

export interface AiWorkoutExercise {
  name: string;
  notes?: string;
  sets?: number;
  reps?: number;
  distance_meters?: number;
}

export interface AiWorkoutBlock {
  section_id: string;
  title?: string;
  config?: {
    time_cap_seconds?: number;
    emom_interval_seconds?: number;
    rounds?: number;
    work_seconds?: number;
    rest_seconds?: number;
  };
  exercises?: AiWorkoutExercise[];
  coach_note?: string;
}

export interface AiWorkoutSuggestion {
  name: string;
  format: TemplateFormat;
  coach_notes?: string;
  warmup?: string;
  blocks: AiWorkoutBlock[];
  matched_exercises: Array<{ name: string; exercise_id: string; exercise_name: string }>;
  methodology_snippets: string[];
}
