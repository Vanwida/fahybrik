import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { approveRacePlan, RacePlanError } from '@/lib/coach/race-plan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) {
    return jsonError('unauthorized', 'Coach session required', 401);
  }

  const { id } = await ctx.params;
  const planId = Number(id);
  if (!Number.isFinite(planId) || planId <= 0) {
    return jsonError('bad_request', 'race_plan_id inválido', 400);
  }

  try {
    const race_plan = await approveRacePlan({
      coach_id: session.coach_id,
      race_plan_id: planId,
    });
    return jsonOk({ race_plan });
  } catch (err) {
    if (err instanceof RacePlanError) {
      const status = errorStatus(err.code);
      return jsonError(err.code, err.message, status);
    }
    throw err;
  }
}

function errorStatus(code: RacePlanError['code']): number {
  switch (code) {
    case 'forbidden':
      return 403;
    case 'not_found':
      return 404;
    default:
      return 400;
  }
}
