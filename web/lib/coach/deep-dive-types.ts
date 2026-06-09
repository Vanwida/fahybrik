// Athlete deep-dive payload types — thin re-export of the shared core.
//
// The shared module (`@fahybrid/shared/domain/coach/deep-dive-types`) holds all
// pure types + behavior-agnostic Zod schemas. The only surface-specific bit is
// `AthleteIdParamSchema`: web accepts demo athlete ids (`demo-*`), so it lives
// here rather than in shared.

import { z } from 'zod';

export * from '@fahybrid/shared/domain/coach/deep-dive-types';

/** Web accepts numeric ids AND demo-* placeholder ids (mock athletes). */
export const AthleteIdParamSchema = z.object({
  id: z.string().regex(/^(\d+|demo-[a-z0-9-]+)$/, 'athlete_id inválido'),
});
