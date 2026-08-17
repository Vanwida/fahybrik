import { z } from 'zod';
import {
  HOW_I_WORK_BODY_MAX,
  type HowIWork,
} from '../domain/coach/how-i-work';

// GET  /api/coach/how-i-work  → CoachHowIWorkResponse
// PUT  /api/coach/how-i-work  ← coachHowIWorkPutSchema  (solo el texto)
// PDF: POST/DELETE/GET /api/coach/how-i-work/pdf
//
// snake_case en el cable. Vacío = has_method false: no imitar.

export const coachHowIWorkPutSchema = z
  .object({
    body_text: z.string().max(HOW_I_WORK_BODY_MAX),
  })
  .strict();

export type CoachHowIWorkPutInput = z.infer<typeof coachHowIWorkPutSchema>;

export interface CoachHowIWorkResponse extends HowIWork {
  /** true = hay texto o PDF. false = no imitar. */
  has_method: boolean;
  updated_at: string | null;
}
