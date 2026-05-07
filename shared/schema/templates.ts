import { z } from 'zod';
import {
  idSchema,
  isoDateTime,
  targetBlock,
  templateFormat,
} from './_primitives.js';

export const templateSchema = z.object({
  id: idSchema,
  coach_id: idSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(8000).nullable(),
  format: templateFormat,
  target_block: targetBlock,
  target_level: z.number().int().min(1).max(10).nullable(),
  version: z.number().int().min(1),
  parent_template_id: idSchema.nullable(),
  day_position: z.string().max(60).nullable(),
  paired_with_template_id: idSchema.nullable(),
  archived_at: isoDateTime.nullable(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type Template = z.infer<typeof templateSchema>;

export const segmentParamsSchema = z.object({
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
