import type { SegmentParams, TemplateFormat, TargetBlock } from '@/lib/templates/schema';

export type ExerciseCategoryToken =
  | 'cardio'
  | 'strength'
  | 'skill'
  | 'hyrox_station'
  | 'mobility'
  | 'plyometric'
  | 'core';

export interface CatalogExercise {
  id: string;
  slug: string;
  name: string;
  category: ExerciseCategoryToken;
  primary_muscle_groups: string[];
  equipment: string[];
  default_metrics_json: Record<string, boolean>;
  hyrox_station_position: number | null;
}

export interface BuilderSegment {
  // local key — server id when persisted, else local-N
  uid: string;
  // server-side persisted id (string of bigint), null for unsaved
  serverId: string | null;
  exercise_id: string;
  exercise_slug: string;
  exercise_name: string;
  exercise_category: ExerciseCategoryToken;
  params_json: SegmentParams;
  notes: string | null;
}

export interface TemplateBuilderInitialState {
  id: string;
  version: number;
  parent_template_id: string | null;
  name: string;
  description: string | null;
  format: TemplateFormat;
  target_block: TargetBlock;
  target_level: number | null;
  day_position: string | null;
  paired_with_template_id: string | null;
  is_draft: boolean;
  is_partner_workout: boolean;
  warmup: string | null;
  cooldown: string | null;
  coach_notes: string | null;
  assignment_count: number;
  updated_at: string;
  segments: Array<{
    id: string;
    position: number;
    exercise_id: string;
    exercise_slug: string;
    exercise_name: string;
    exercise_category: string;
    params_json: Record<string, unknown>;
    notes: string | null;
  }>;
}
