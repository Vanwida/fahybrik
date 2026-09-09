import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  getCoachPlanWeekHorizon,
  updateCoachPlanWeekHorizon,
} from '@/lib/coach/plan-week-horizon';
import { coachPlanWeekHorizonPatchSchema } from '@fahybrid/shared/schema/coach-plan-week-horizon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/coach/plan-week-horizon — horizonte de visibilidad del plan del club.
export async function GET() {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const horizon = await getCoachPlanWeekHorizon(session.coach_id);
  return jsonOk(horizon);
}

// PATCH /api/coach/plan-week-horizon — el atleta hereda el cambio en la siguiente carga.
export async function PATCH(req: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = coachPlanWeekHorizonPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsed.error.flatten());
  }

  const horizon = await updateCoachPlanWeekHorizon(
    session.coach_id,
    parsed.data.plan_week_horizon,
  );
  return jsonOk(horizon);
}
