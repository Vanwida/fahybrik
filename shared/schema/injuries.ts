import { z } from 'zod';
import {
  INJURY_ZONES,
  INJURY_SEVERITIES,
  INJURY_STATUSES,
  INJURY_ADAPTATIONS,
} from '../domain/coach/injury-taxonomy';

// Server-validated shapes for injury management (#16). Zone/severity/status enums
// derive from the canonical taxonomy — never redeclared here.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

export const injuryZoneSchema = z.enum(INJURY_ZONES);
export const injurySeveritySchema = z.enum(INJURY_SEVERITIES);
export const injuryStatusSchema = z.enum(INJURY_STATUSES);
export const injuryAdaptationSchema = z.enum(INJURY_ADAPTATIONS);

/** Register a new injury episode (athlete self-report OR coach). */
export const injuryCreateSchema = z.object({
  zone: injuryZoneSchema,
  type: z.string().trim().max(120).nullish(),
  severity: injurySeveritySchema.default('leve'),
  onset_date: isoDate.optional(),
  note: z.string().trim().max(2000).nullish(),
});
export type InjuryCreateInput = z.infer<typeof injuryCreateSchema>;

/**
 * Update an injury: a status transition and/or a timeline note. Every update
 * appends an `injury_updates` row; a status change is validated against the
 * state machine server-side. `expected_return` / `resolved_date` are coach-set.
 */
export const injuryUpdateSchema = z
  .object({
    status: injuryStatusSchema.optional(),
    severity: injurySeveritySchema.optional(),
    expected_return: isoDate.nullish(),
    resolved_date: isoDate.nullish(),
    note: z.string().trim().max(2000).nullish(),
  })
  .refine((v) => v.status != null || v.severity != null || v.expected_return !== undefined || (v.note != null && v.note !== ''), {
    message: 'La actualización necesita al menos un cambio o una nota',
  });
export type InjuryUpdateInput = z.infer<typeof injuryUpdateSchema>;

/** Tag one or more of the athlete's scheduled sessions as injury-adapted. */
export const injuryAdaptSessionsSchema = z.object({
  injury_id: z.coerce.number().int().positive(),
  adaptations: z
    .array(
      z.object({
        assignment_id: z.coerce.number().int().positive(),
        adaptation: injuryAdaptationSchema,
      }),
    )
    .min(1)
    .max(30),
});
export type InjuryAdaptSessionsInput = z.infer<typeof injuryAdaptSessionsSchema>;

// Read DTO returned to coach + athlete surfaces.
export interface InjuryDTO {
  id: string;
  zone: z.infer<typeof injuryZoneSchema>;
  type: string | null;
  severity: z.infer<typeof injurySeveritySchema>;
  status: z.infer<typeof injuryStatusSchema>;
  onset_date: string;
  resolved_date: string | null;
  expected_return: string | null;
  registered_by: 'athlete' | 'coach';
  note: string | null;
  pause_id: string | null;
  updated_at: string;
  updates: InjuryUpdateDTO[];
}
export interface InjuryUpdateDTO {
  id: string;
  status: z.infer<typeof injuryStatusSchema> | null;
  note: string | null;
  recorded_by: 'athlete' | 'coach';
  recorded_at: string;
}
