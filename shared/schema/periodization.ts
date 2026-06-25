import { z } from 'zod';
import {
  atrBlockType,
  blockStatus,
  idSchema,
  isoDate,
  isoDateTime,
  macrocycleStatus,
} from './_primitives';

export const atrMacrocycleSchema = z.object({
  id: idSchema,
  athlete_id: idSchema,
  target_event_id: idSchema.nullable(),
  name: z.string().max(200).nullable(),
  start_date: isoDate,
  end_date: isoDate,
  status: macrocycleStatus,
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type AtrMacrocycle = z.infer<typeof atrMacrocycleSchema>;

export const atrBlockSchema = z.object({
  id: idSchema,
  macrocycle_id: idSchema,
  // Legacy phase enum (kept as fallback). New writes set phase_id (0052).
  type: atrBlockType,
  // FK -> methodology_phases (coach-defined phase). NULL => fall back to `type`.
  phase_id: idSchema.nullable().optional(),
  position: z.number().int().nonnegative(),
  start_date: isoDate,
  end_date: isoDate,
  status: blockStatus,
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type AtrBlock = z.infer<typeof atrBlockSchema>;

export const microcycleSchema = z.object({
  id: idSchema,
  block_id: idSchema,
  week_number: z.number().int().min(1),
  start_date: isoDate,
  end_date: isoDate,
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type Microcycle = z.infer<typeof microcycleSchema>;
