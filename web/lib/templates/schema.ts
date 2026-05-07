// Local mirror of the template-builder validation schemas. Mirrors
// `@fahybrik/shared/schema/templates.ts` — kept in sync manually because the
// Next.js bundler currently cannot resolve the workspace package's `.js`
// extension imports. When the shared package is built/published, switch back
// to importing from `@fahybrik/shared/schema`.

import { z } from 'zod';

export const templateFormatSchema = z.enum([
  'amrap',
  'for_time',
  'emom',
  'intervals',
  'strength_block',
  'hyrox_sim',
  'tempo',
  'circuit',
]);
export type TemplateFormat = z.infer<typeof templateFormatSchema>;

export const targetBlockSchema = z.enum(['ACC', 'TRANS', 'REAL', 'any']);
export type TargetBlock = z.infer<typeof targetBlockSchema>;

export const exerciseCategorySchema = z.enum([
  'cardio',
  'strength',
  'skill',
  'hyrox_station',
  'mobility',
  'plyometric',
  'core',
]);
export type ExerciseCategory = z.infer<typeof exerciseCategorySchema>;

const idSchema = z.coerce.bigint().or(z.number().int().nonnegative());

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

export const segmentConditionalSchema = z.object({
  metric: z.enum(['hrv', 'sleep_score', 'recovery', 'rpe_yesterday', 'soreness']),
  op: z.enum(['lt', 'lte', 'gt', 'gte']),
  baseline_offset: z.number().optional(),
  value: z.number().optional(),
  then: z.enum(['substitute', 'skip', 'reduce_volume', 'reduce_intensity']),
  substitute_exercise_slug: z.string().max(120).optional(),
  note: z.string().max(400).optional(),
});

export const segmentAlternativeSchema = z.object({
  exercise_slug: z.string().max(120),
  reps: z.number().int().nonnegative().optional(),
  sets: z.number().int().positive().optional(),
  time_seconds: z.number().int().nonnegative().optional(),
  distance_meters: z.number().nonnegative().optional(),
  weight_kg: z.number().nonnegative().optional(),
  note: z.string().max(400).optional(),
});

export const segmentLevelNotesSchema = z.object({
  level_1: z.string().max(800).optional(),
  level_2: z.string().max(800).optional(),
  level_3: z.string().max(800).optional(),
});

export const segmentParamsSchema = z.object({
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
  cardio_mode: z.enum(['distance', 'time']).optional(),
  pace_target: z.string().max(40).optional(),
  power_watts: z.number().int().nonnegative().optional(),
  cadence_target: z.string().max(40).optional(),
  quality_threshold: z.string().max(200).optional(),
  station_alt_classes: z.array(z.string().max(40)).max(8).optional(),
  intensity: z.enum(['light', 'medium', 'hard']).optional(),
  week_variants: z.array(segmentWeekVariantSchema).max(20).optional(),
  conditional: segmentConditionalSchema.optional(),
  alternatives: z.array(segmentAlternativeSchema).max(4).optional(),
  level_notes: segmentLevelNotesSchema.optional(),
});
export type SegmentParams = z.infer<typeof segmentParamsSchema>;

export const templateSegmentInputSchema = z.object({
  exercise_id: idSchema,
  position: z.number().int().nonnegative(),
  params_json: segmentParamsSchema.default({}),
  notes: z.string().max(4000).nullable().optional(),
});

export const templateUpsertSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(8000).nullable().optional(),
  format: templateFormatSchema,
  target_block: targetBlockSchema,
  target_level: z.number().int().min(1).max(10).nullable().optional(),
  day_position: z.string().max(60).nullable().optional(),
  paired_with_template_id: idSchema.nullable().optional(),
  is_partner_workout: z.boolean().optional(),
  warmup: z.string().max(2000).nullable().optional(),
  cooldown: z.string().max(2000).nullable().optional(),
  coach_notes: z.string().max(4000).nullable().optional(),
  segments: z.array(templateSegmentInputSchema).max(60),
});
export type TemplateUpsert = z.infer<typeof templateUpsertSchema>;
