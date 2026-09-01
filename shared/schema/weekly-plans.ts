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
  // Optional link to the microcycle this week belongs to. NULL when the
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
  // Foco de ESTA semana del atleta (migración 0182) — override del foco heredado
  // de `program_week_templates.focus`. NULL = sin override (lib/athlete/week-plan.ts
  // cae al de la plantilla).
  focus: z.string().max(200).nullable(),
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
    focus: true,
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
    focus: true,
  })
  .partial();
export type WeeklyPlanUpdate = z.infer<typeof weeklyPlanUpdateSchema>;

// Escritura del foco de UNA semana del atleta (dashboard PATCH + tool MCP
// set_week_focus). Mismo patrón que `programWeekMetaSchema` (program-templates.ts):
// vacío/blancos → null (borra el override), nunca una cadena vacía guardada.
export const weeklyPlanFocusInputSchema = z.object({
  week_start: isoDate,
  focus: z
    .string()
    .max(200)
    .nullable()
    .transform((v) => {
      const t = v?.trim();
      return t ? t : null;
    }),
});
export type WeeklyPlanFocusInput = z.infer<typeof weeklyPlanFocusInputSchema>;

// Coach publish-gate input. Publishing flips weekly_plans.status to 'published',
// which makes a week visible to the athlete plan endpoint.
//   - `week_start`  : publish a SINGLE week (the proposal / next-week path).
//   - `week_starts` : publish a whole run of microcycles at once (every week the run
//                     spans), so a block created in draft via /assign-draft is
//                     never left with holes hidden by the gate.
// Exactly one of the two must be present.
export const publishWeekInputSchema = z
  .object({
    week_start: isoDate.optional(),
    week_starts: z.array(isoDate).min(1).optional(),
  })
  .refine(
    (v) => (v.week_start != null) !== (v.week_starts != null),
    'Indica week_start (una semana) o week_starts (un bloque), no ambos.',
  );
export type PublishWeekInput = z.infer<typeof publishWeekInputSchema>;

// Publish a whole ASSIGNED microciclo to the athlete in one action. The id is the
// `athlete_month_assignments` row (the materialized microciclo, resolved on the
// athlete plan surface); publishing flips EVERY weekly_plans week of that
// assignment to 'published'. Idempotent — re-publishing re-stamps the rows.
export const publishMicrocicloInputSchema = z.object({
  month_assignment_id: idSchema,
});
export type PublishMicrocicloInput = z.infer<typeof publishMicrocicloInputSchema>;
