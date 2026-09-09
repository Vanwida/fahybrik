import { z } from 'zod';
import {
  PLAN_WEEK_HORIZON_VALUES,
  type PlanWeekHorizon,
} from '../domain/coach/plan-week-horizon';

// Contrato de cable del horizonte de visibilidad del plan.
//   GET  /api/coach/plan-week-horizon  → CoachPlanWeekHorizonResponse
//   PATCH /api/coach/plan-week-horizon ← coachPlanWeekHorizonPatchSchema

export const planWeekHorizonSchema = z.enum(PLAN_WEEK_HORIZON_VALUES);

export const coachPlanWeekHorizonPatchSchema = z
  .object({
    plan_week_horizon: planWeekHorizonSchema,
  })
  .strict();

export type CoachPlanWeekHorizonPatchInput = z.infer<typeof coachPlanWeekHorizonPatchSchema>;

export interface CoachPlanWeekHorizonResponse {
  plan_week_horizon: PlanWeekHorizon;
  max_week_offset: number;
  updated_at: string | null;
}

/** Lo que viaja al atleta en GET /api/athlete/plan/week (additive). */
export interface AthletePlanWeekVisibility {
  max_week_offset: number;
  /** Null cuando el atleta no tiene coach (free). */
  horizon: PlanWeekHorizon | null;
  /** true cuando hay semana publicada más adelante pero el tope del club lo impide. */
  peek_blocked_by_horizon: boolean;
  /** Copy para el muro cuando `peek_blocked_by_horizon` o un 403 por offset. */
  wall_message: string | null;
}
