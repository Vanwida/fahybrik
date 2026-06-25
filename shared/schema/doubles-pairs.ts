import { z } from 'zod';
import { isoDate } from './_primitives';

// Input for POST /api/coach/doubles/pairs — link two of the coach's athletes
// into a HYROX Dobles training pair. The coach comes from the session; the two
// athletes are referenced by id. Ownership + same-coach + not-already-paired +
// level/days reconciliation are all enforced server-side (the client only names
// the two athletes).
export const createDoublesPairInputSchema = z
  .object({
    athlete_a_id: z.coerce.number().int().positive(),
    athlete_b_id: z.coerce.number().int().positive(),
  })
  .refine((v) => v.athlete_a_id !== v.athlete_b_id, {
    message: 'Una pareja necesita dos atletas distintos.',
    path: ['athlete_b_id'],
  });

export type CreateDoublesPairInput = z.infer<typeof createDoublesPairInputSchema>;

// Input for POST /api/coach/doubles/pairs/[id]/assign-sequence — assign ONE plan
// to the pair (materializes for BOTH athletes). Optional start_date override
// (defaults to next Monday, box tz) mirrors the individual assign endpoint.
export const assignPairSequenceInputSchema = z.object({
  start_date: isoDate.optional(),
});

export type AssignPairSequenceInput = z.infer<typeof assignPairSequenceInputSchema>;
