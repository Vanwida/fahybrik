import { z } from 'zod';
import {
  exerciseCategory,
  idSchema,
  isoDateTime,
  slugSchema,
} from './_primitives';
// Modality is an INTRINSIC property of the exercise (migration 0053). Reuse the
// canonical prescription Modality enum so the catalog row, the DB CHECK, and the
// per-line prescription all agree on the same 9 values (single source of truth).
import { modalitySchema } from '../domain/prescription';

export const defaultMetricsSchema = z.object({
  reps: z.boolean().optional(),
  time: z.boolean().optional(),
  distance: z.boolean().optional(),
  weight: z.boolean().optional(),
  calories: z.boolean().optional(),
  rpe: z.boolean().optional(),
  hr: z.boolean().optional(),
});
export type DefaultMetrics = z.infer<typeof defaultMetricsSchema>;

export const exerciseSchema = z.object({
  id: idSchema,
  slug: slugSchema,
  name: z.string().min(1).max(200),
  category: exerciseCategory,
  // The exercise's training modality — intrinsic, the default source of truth a
  // prescription line derives its modality from (migration 0053).
  modality: modalitySchema,
  primary_muscle_groups: z.array(z.string().min(1).max(60)).default([]),
  equipment: z.array(z.string().min(1).max(60)).default([]),
  default_metrics_json: defaultMetricsSchema.default({}),
  hyrox_station_position: z.number().int().min(1).max(8).nullable(),
  description: z.string().max(4000).nullable(),
  cues: z.string().max(4000).nullable(),
  video_url: z.string().url().nullable(),
  source: z.string().max(200).nullable(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type Exercise = z.infer<typeof exerciseSchema>;

export const exerciseInsertSchema = exerciseSchema
  .omit({ id: true, created_at: true, updated_at: true });
export type ExerciseInsert = z.infer<typeof exerciseInsertSchema>;
