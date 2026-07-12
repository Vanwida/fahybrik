import { z } from 'zod';
import {
  COACH_GUIDANCE_CONTEXTS,
  COACH_GUIDANCE_MAX_ITEMS,
  COACH_GUIDANCE_MAX_ITEM_CHARS,
  type CoachGuidanceContext,
} from '../domain/coach-guidance';

// Wire schema for the coach's "consejos" editor.
//   GET  /api/coach/guidance/[context]  → CoachGuidanceResponse
//   PUT  /api/coach/guidance/[context]  ← coachGuidancePutSchema
// One source of truth for the shape shared by the route (server validation) and
// the dashboard editor. snake_case on the wire; validated server-side on write.

/** The context path param, validated against the domain's allowed contexts. */
export const coachGuidanceContextSchema = z.enum(COACH_GUIDANCE_CONTEXTS);

/** One tip: trimmed, non-empty, bounded. Empty/blank lines are rejected so the
 *  editor's "one tip per line" never stores a blank bullet. */
const guidanceItemSchema = z
  .string()
  .trim()
  .min(1, 'Un consejo no puede estar vacío')
  .max(COACH_GUIDANCE_MAX_ITEM_CHARS, `Máximo ${COACH_GUIDANCE_MAX_ITEM_CHARS} caracteres por consejo`);

/**
 * PUT body — the full ordered tip list for one context. Between 1 and
 * COACH_GUIDANCE_MAX_ITEMS tips; order is meaningful (it's how they're shown).
 */
export const coachGuidancePutSchema = z
  .object({
    items: z
      .array(guidanceItemSchema)
      .min(1, 'Escribe al menos un consejo')
      .max(COACH_GUIDANCE_MAX_ITEMS, `Máximo ${COACH_GUIDANCE_MAX_ITEMS} consejos`),
  })
  .strict();
export type CoachGuidancePutInput = z.infer<typeof coachGuidancePutSchema>;

/** GET response: the resolved tips + whether they are the coach's own edit or the
 *  system defaults (so the editor can label "usando los consejos del sistema"). */
export interface CoachGuidanceResponse {
  context: CoachGuidanceContext;
  items: string[];
  /** true = a coach-authored row; false = the system defaults are being shown. */
  is_custom: boolean;
  updated_at: string | null;
}
