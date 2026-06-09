// Athlete deep-dive payload types — thin re-export of the shared core.
//
// The shared module (`@fahybrid/shared/domain/coach/deep-dive-types`) holds all
// pure types + behavior-agnostic Zod schemas. The only surface-specific bit is
// `AthleteIdParamSchema`: coach is numeric-only (no demo athletes), so it lives
// here rather than in shared.

import { z } from 'zod';

export * from '@fahybrid/shared/domain/coach/deep-dive-types';

/** Coach accepts only numeric athlete ids (no demo placeholders). */
export const AthleteIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'athlete_id inválido'),
});
