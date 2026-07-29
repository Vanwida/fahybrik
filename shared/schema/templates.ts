import { z } from 'zod';
import {
  idSchema,
  isoDateTime,
  templateFormat,
} from './_primitives';
import { prescriptionSchema } from '../domain/prescription';

export const templateSchema = z.object({
  id: idSchema,
  coach_id: idSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(8000).nullable(),
  format: templateFormat,
  target_level: z.number().int().min(1).max(10).nullable(),
  version: z.number().int().min(1),
  parent_template_id: idSchema.nullable(),
  day_position: z.string().max(60).nullable(),
  paired_with_template_id: idSchema.nullable(),
  is_draft: z.boolean().default(false),
  is_partner_workout: z.boolean().default(false),
  warmup: z.string().max(2000).nullable(),
  cooldown: z.string().max(2000).nullable(),
  coach_notes: z.string().max(4000).nullable(),
  demo_video_url: z.string().url().max(500).nullable(),
  meta_json: z.record(z.unknown()).default({}),
  archived_at: isoDateTime.nullable(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type Template = z.infer<typeof templateSchema>;

// Per-week progression cell (for templates that auto-progress across a microcycle).
// Coach defines values for week 1..N; the engine picks the cell matching the current
// microcycle. Each cell may override a subset of params.
export const segmentWeekVariantSchema = z.object({
  week: z.number().int().min(1).max(20),
  reps: z.number().int().nonnegative().optional(),
  sets: z.number().int().positive().optional(),
  time_seconds: z.number().int().nonnegative().optional(),
  distance_meters: z.number().nonnegative().optional(),
  weight_kg: z.number().nonnegative().optional(),
  weight_pct_1rm: z.number().min(0).max(200).optional(),
  rpe: z.number().min(1).max(10).optional(),
  hr_zone: z.number().int().min(1).max(7).optional(),
  pace_target: z.string().max(40).optional(),
  power_watts: z.number().int().nonnegative().optional(),
  tempo: z.string().max(20).optional(),
  rest_seconds: z.number().int().nonnegative().optional(),
  note: z.string().max(400).optional(),
});
export type SegmentWeekVariant = z.infer<typeof segmentWeekVariantSchema>;

// Conditional clause evaluated at workout-start to swap segment behaviour.
// Engine reads `metric` from athlete state and compares with `op` + `value` against
// `baseline_offset` (e.g., HRV last 3d < baseline -10ms).
export const segmentConditionalSchema = z.object({
  metric: z.enum(['hrv', 'sleep_score', 'recovery', 'rpe_yesterday', 'soreness']),
  op: z.enum(['lt', 'lte', 'gt', 'gte']),
  baseline_offset: z.number().optional(),
  value: z.number().optional(),
  then: z.enum(['substitute', 'skip', 'reduce_volume', 'reduce_intensity']),
  substitute_exercise_slug: z.string().max(120).optional(),
  note: z.string().max(400).optional(),
});
export type SegmentConditional = z.infer<typeof segmentConditionalSchema>;

// Equipment substitution: alternative segment if the athlete cannot run the primary spec
// (e.g., home gym day, no sled).
export const segmentAlternativeSchema = z.object({
  exercise_slug: z.string().max(120),
  reps: z.number().int().nonnegative().optional(),
  sets: z.number().int().positive().optional(),
  time_seconds: z.number().int().nonnegative().optional(),
  distance_meters: z.number().nonnegative().optional(),
  weight_kg: z.number().nonnegative().optional(),
  note: z.string().max(400).optional(),
});
export type SegmentAlternative = z.infer<typeof segmentAlternativeSchema>;

export const segmentLevelNotesSchema = z.object({
  level_1: z.string().max(800).optional(),
  level_2: z.string().max(800).optional(),
  level_3: z.string().max(800).optional(),
});
export type SegmentLevelNotes = z.infer<typeof segmentLevelNotesSchema>;

export const cardioModeSchema = z.enum(['distance', 'time']);

// Full segment params payload — superset of all category-specific fields.
// `category` indicates which fields are primary; others are ignored by athlete UI.
export const segmentParamsSchema = z.object({
  // Universal
  sets: z.number().int().positive().optional(),
  reps: z.number().int().nonnegative().optional(),
  time_seconds: z.number().int().nonnegative().optional(),
  distance_meters: z.number().nonnegative().optional(),
  weight_kg: z.number().nonnegative().optional(),
  weight_pct_1rm: z.number().min(0).max(200).optional(),
  rpe: z.number().min(1).max(10).optional(),
  hr_target_bpm: z.number().int().min(30).max(260).optional(),
  hr_zone: z.number().int().min(1).max(7).optional(),
  rest_seconds: z.number().int().nonnegative().optional(),
  rounds: z.number().int().positive().optional(),
  tempo: z.string().max(20).optional(),

  // Cardio-specific
  cardio_mode: cardioModeSchema.optional(),
  pace_target: z.string().max(40).optional(),
  power_watts: z.number().int().nonnegative().optional(),
  cadence_target: z.string().max(40).optional(),

  // Skill-specific
  quality_threshold: z.string().max(200).optional(),

  // HYROX station alt classes (e.g. 6/9/12 kg wall ball, sled weight chips)
  station_alt_classes: z.array(z.string().max(40)).max(8).optional(),

  // Mobility intensity
  intensity: z.enum(['light', 'medium', 'hard']).optional(),

  // Per-segment demo (YouTube) — overrides exercise catalog video when set
  video_url: z.string().url().max(500).optional(),

  // Élite advanced features
  week_variants: z.array(segmentWeekVariantSchema).max(20).optional(),
  conditional: segmentConditionalSchema.optional(),
  alternatives: z.array(segmentAlternativeSchema).max(4).optional(),
  level_notes: segmentLevelNotesSchema.optional(),
});
export type SegmentParams = z.infer<typeof segmentParamsSchema>;

export const templateSegmentSchema = z.object({
  id: idSchema,
  template_id: idSchema,
  position: z.number().int().nonnegative(),
  exercise_id: idSchema,
  params_json: segmentParamsSchema.default({}),
  notes: z.string().max(4000).nullable(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type TemplateSegment = z.infer<typeof templateSegmentSchema>;

// API contract — mutation payloads
export const templateSegmentInputSchema = z.object({
  exercise_id: idSchema,
  position: z.number().int().nonnegative(),
  params_json: segmentParamsSchema.default({}),
  notes: z.string().max(4000).nullable().optional(),
  // Structured per-set prescription (migration 0043). TRANSITION: accepted
  // alongside params_json; readers prefer prescription_json when present.
  // Validated against the shared model so an invalid shape is rejected
  // server-side. null/undefined = not provided (legacy params_json still used).
  prescription_json: prescriptionSchema.nullable().optional(),
});
export type TemplateSegmentInput = z.infer<typeof templateSegmentInputSchema>;

export const templateUpsertSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(8000).nullable().optional(),
  format: templateFormat,
  target_level: z.number().int().min(1).max(10).nullable().optional(),
  day_position: z.string().max(60).nullable().optional(),
  paired_with_template_id: idSchema.nullable().optional(),
  is_partner_workout: z.boolean().optional(),
  warmup: z.string().max(2000).nullable().optional(),
  cooldown: z.string().max(2000).nullable().optional(),
  coach_notes: z.string().max(4000).nullable().optional(),
  demo_video_url: z.string().url().max(500).nullable().optional(),
  meta_json: z.record(z.unknown()).optional(),
  segments: z.array(templateSegmentInputSchema).max(60),
});
export type TemplateUpsert = z.infer<typeof templateUpsertSchema>;
