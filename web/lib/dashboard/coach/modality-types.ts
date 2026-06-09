// Client-safe payload types for the coach-side run-vs-row modality analytics,
// served by GET /api/coach/athletes/[id]/modality. Kept free of `server-only`
// so the client view component can import the shapes. snake_case to mirror the
// API JSON contract (Swift Codable / Brain convention).

/** Modalities the segmentation engine can distinguish within a mixed block. */
export const MODALITIES = ['run', 'row', 'ski', 'bike'] as const;
export type Modality = (typeof MODALITIES)[number];

export interface ModalityTotals {
  modality: string;
  distance_meters: number;
  duration_seconds: number;
  sessions: number;
  /** Avg running pace, seconds per km. Null for non-distance-paced modalities. */
  avg_pace_s_per_km: number | null;
  /** Avg erg split, seconds per 500m. Null when not applicable. */
  avg_pace_s_per_500m: number | null;
}

export interface ModalityWeeklyPoint {
  /** ISO date of the week start (Monday). */
  week_start: string;
  modality: string;
  distance_meters: number;
  duration_seconds: number;
  sessions: number;
}

export interface ModalitySegment {
  position: number;
  modality: string;
  distance_meters: number | null;
  duration_seconds: number | null;
  avg_pace_s_per_500m: number | null;
  avg_pace_s_per_km: number | null;
  avg_power_w: number | null;
  stroke_rate_spm: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  calories: number | null;
  reps_completed: number | null;
  weight_used_kg: number | null;
}

export interface ModalityExecution {
  execution_id: string;
  date: string;
  total_duration_seconds: number | null;
  perceived_exertion: number | null;
  segments: ModalitySegment[];
}

export interface ModalityPayload {
  by_modality_totals: ModalityTotals[];
  weekly: ModalityWeeklyPoint[];
  recent_executions: ModalityExecution[];
}
