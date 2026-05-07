import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { buildCohort } from '@/lib/coach/cohort';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getCoachSession();
  if (!session) {
    return jsonError('unauthorized', 'Coach session required', 401);
  }

  const cohort = await buildCohort({ coach_id: session.coach_id });
  return jsonOk({ cohort });
}
