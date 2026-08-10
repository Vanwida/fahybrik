import { z } from 'zod';

// Input for POST /api/coach/athletes/[id]/personalize-plan.
//
// Unlike assign-month/assign-sequence (a real start_date — personalize-plan.ts
// explains why a full date picker doesn't map coherently onto "fork from where
// the athlete already is"), the only optional client input is WHICH week the
// fork starts at: `'current_week'` (default, unchanged historical behaviour —
// forks from the week the athlete is living right now) or `'next_week'` (lets
// the current week finish on the standard plan first).
export const personalizePlanInputSchema = z.object({
  start: z.enum(['current_week', 'next_week']).optional(),
});

export type PersonalizePlanInput = z.infer<typeof personalizePlanInputSchema>;
