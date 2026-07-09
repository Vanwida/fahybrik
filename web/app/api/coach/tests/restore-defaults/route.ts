import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { restoreDefaultTests } from '@/lib/coach/restore-default-tests';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/coach/tests/restore-defaults — (re)seed the four default calibration tests
// for this coach from DEFAULT_CALIBRATION_BATTERY. Idempotent; never touches custom tests.
// Returns { created, restored, tests }.
export async function POST() {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const result = await restoreDefaultTests(session.coach_id);
  return jsonOk(result);
}
