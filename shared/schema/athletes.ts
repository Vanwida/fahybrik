import { z } from 'zod';
import {
  athleteSex,
  discipline,
  equipmentAccess,
  idSchema,
  isoDate,
  isoDateTime,
} from './_primitives';

export const injurySchema = z.object({
  area: z.string().min(1).max(120),
  severity: z.enum(['mild', 'moderate', 'severe']).optional(),
  notes: z.string().max(2000).optional(),
  active: z.boolean().default(true),
  recorded_at: isoDateTime.optional(),
});
export type Injury = z.infer<typeof injurySchema>;

export const athleteSchema = z.object({
  id: idSchema,
  user_id: idSchema,
  coach_id: idSchema.nullable(),
  full_name: z.string().min(1).max(200),
  dob: isoDate.nullable(),
  sex: athleteSex.nullable(),
  height_cm: z.number().min(80).max(260).nullable(),
  weight_kg: z.number().min(25).max(250).nullable(),
  body_fat_pct: z.number().min(2).max(60).nullable(),
  training_experience_years: z.number().min(0).max(80).nullable(),
  primary_discipline: discipline.nullable(),
  training_days_per_week: z.number().int().min(1).max(14).nullable(),
  equipment_access: equipmentAccess.nullable(),
  injuries_json: z.array(injurySchema).default([]),
  onboarded_at: isoDateTime.nullable(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type Athlete = z.infer<typeof athleteSchema>;

export const athleteInsertSchema = athleteSchema
  .omit({ id: true, created_at: true, updated_at: true })
  .partial({
    coach_id: true,
    dob: true,
    sex: true,
    height_cm: true,
    weight_kg: true,
    body_fat_pct: true,
    training_experience_years: true,
    primary_discipline: true,
    training_days_per_week: true,
    equipment_access: true,
    injuries_json: true,
    onboarded_at: true,
  });
export type AthleteInsert = z.infer<typeof athleteInsertSchema>;

export const athleteBenchmarkSchema = z.object({
  id: idSchema,
  athlete_id: idSchema,
  exercise_slug: z.string().min(1).max(120),
  value: z.number(),
  unit: z.string().min(1).max(20),
  recorded_at: isoDateTime,
  notes: z.string().max(2000).nullable(),
  created_at: isoDateTime,
});
export type AthleteBenchmark = z.infer<typeof athleteBenchmarkSchema>;
