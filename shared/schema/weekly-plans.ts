import { z } from 'zod';
import { idSchema, isoDate, isoDateTime, weeklyPlanStatus } from './_primitives';

// Coach weekly planning surface (D1, migration 0021).
//
// One row per (athlete_id, week_start). The IA can propose a plan
// (`ia_proposed = true`); the coach reviews and either keeps it as draft,
// publishes it (visible to the athlete), or archives it. `shared = true`
// means the plan is shared between paired Dobles athletes.

export const weeklyPlanSchema = z.object({
  id: idSchema,
  athlete_id: idSchema,
  // Optional link to the ATR microcycle this week belongs to. NULL when the
  // plan is created outside the microcycle structure (free planning).
  microcycle_id: idSchema.nullable(),
  // Monday of the ISO week (YYYY-MM-DD).
  week_start: isoDate,
  status: weeklyPlanStatus,
  // True when the plan was originally drafted by the IA. Stays true even after
  // the coach edits it, so we can track IA-vs-human authorship.
  ia_proposed: z.boolean(),
  // Coach who approved (published) the plan. NULL while it's still a draft.
  approved_by: idSchema.nullable(),
  // Whether this plan is shared between the paired Dobles partners.
  shared: z.boolean(),
  notes: z.string().max(4000).nullable(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type WeeklyPlan = z.infer<typeof weeklyPlanSchema>;

export const weeklyPlanInsertSchema = weeklyPlanSchema
  .omit({ id: true, created_at: true, updated_at: true })
  .partial({
    microcycle_id: true,
    status: true,
    ia_proposed: true,
    approved_by: true,
    shared: true,
    notes: true,
  });
export type WeeklyPlanInsert = z.infer<typeof weeklyPlanInsertSchema>;

export const weeklyPlanUpdateSchema = weeklyPlanSchema
  .pick({
    microcycle_id: true,
    status: true,
    ia_proposed: true,
    approved_by: true,
    shared: true,
    notes: true,
  })
  .partial();
export type WeeklyPlanUpdate = z.infer<typeof weeklyPlanUpdateSchema>;
