import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { upsertRacePlan, RacePlanError } from '@/lib/coach/race-plan';
import { racePlanUpsertSchema } from '@/lib/coach/race-plan-schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const session = await getCoachSession();
  if (!session) {
    return jsonError('unauthorized', 'Coach session required', 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = racePlanUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'payload inválido', 400, parsed.error.flatten());
  }

  try {
    const race_plan = await upsertRacePlan({
      coach_id: session.coach_id,
      payload: parsed.data,
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
    case 'no_a_event':
    case 'too_early':
    case 'a_event_passed':
    case 'plan_locked':
    case 'plan_already_approved':
    case 'invalid':
      return 400;
    default:
      return 400;
  }
}
