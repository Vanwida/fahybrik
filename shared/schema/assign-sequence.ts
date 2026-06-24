import { z } from 'zod';
import { isoDate } from './_primitives';

// Input for POST /api/coach/athletes/[id]/assign-sequence.
//
// The athlete + coach come from the route param + session; the sequence is
// RESOLVED server-side from the athlete's (level_id, training_days_per_week) — it
// is NEVER passed by the client (no way to assign a sequence the athlete doesn't
// resolve to). The only optional client input is an override start_date; when
// absent the server defaults to next Monday (box timezone).
export const assignSequenceInputSchema = z.object({
  start_date: isoDate.optional(),
});

export type AssignSequenceInput = z.infer<typeof assignSequenceInputSchema>;
