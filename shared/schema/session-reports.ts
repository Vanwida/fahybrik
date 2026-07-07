// Zod for the 1:1 session report (#14). Server-side validated on create + edit.
// Subject is a lead OR an athlete (at least one). The sales-call fields (outcome,
// quoted_price_eur) are optional — an athlete 1:1 leaves them null.

import { z } from 'zod';
import { SESSION_OUTCOMES } from '../domain/sessions/outcome';

const outcome = z.enum(SESSION_OUTCOMES);
const notes = z.string().trim().max(8000).optional();
const nextSteps = z.string().trim().max(4000).optional();
const duration = z.coerce.number().int().min(5).max(300).optional();
// ISO datetime; the store defaults to now() (or the appointment's start) when omitted.
const occurredAt = z.string().datetime({ offset: true }).optional();
const price = z.coerce.number().min(0).max(99999).nullable().optional();

/** Create a report. Exactly the subject (lead_id | athlete_id) + the content. */
export const sessionReportInput = z
  .object({
    lead_id: z.coerce.number().int().positive().nullable().optional(),
    athlete_id: z.coerce.number().int().positive().nullable().optional(),
    appointment_id: z.coerce.number().int().positive().nullable().optional(),
    occurred_at: occurredAt,
    duration_minutes: duration,
    notes,
    next_steps: nextSteps,
    outcome: outcome.nullable().optional(),
    quoted_price_eur: price,
  })
  .strict()
  .refine((d) => d.lead_id != null || d.athlete_id != null, {
    message: 'Se requiere lead_id o athlete_id',
    path: ['lead_id'],
  });
export type SessionReportInput = z.infer<typeof sessionReportInput>;

/** Edit an existing report — content only; the subject never moves. */
export const sessionReportUpdateInput = z
  .object({
    occurred_at: occurredAt,
    duration_minutes: duration,
    notes,
    next_steps: nextSteps,
    outcome: outcome.nullable().optional(),
    quoted_price_eur: price,
  })
  .strict();
export type SessionReportUpdateInput = z.infer<typeof sessionReportUpdateInput>;
