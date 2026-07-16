import { z } from 'zod';

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { startCalibrationTest, type StartTestError } from '@/lib/coach/start-calibration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/athlete/test-battery/start — the athlete taps «Probarme» on a test and
// gets an ad-hoc calibration session TODAY (outside the coach's auto-scheduled week-1
// battery). Thin wrapper: the DB-testable core is startCalibrationTest. Athlete
// bearer. snake_case. Body: { slug } (a coach_calibration_tests.slug).
const startBodySchema = z.object({
  slug: z.string().min(1).max(60),
});

const ERROR_STATUS: Record<StartTestError, number> = {
  no_coach: 422,
  test_not_found: 404,
  test_not_ready: 422,
};

export async function POST(req: Request) {
  const auth = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Athlete bearer token required', 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }
  const parsed = startBodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsed.error.flatten());
  }

  const result = await startCalibrationTest({
    athlete_id: Number(auth.athlete_id),
    slug: parsed.data.slug,
  });

  if (!result.ok) {
    return jsonError(result.error, 'No se pudo iniciar el test', ERROR_STATUS[result.error]);
  }
  return jsonOk(result.data, result.data.reused ? 200 : 201);
}
