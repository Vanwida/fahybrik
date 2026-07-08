import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { listCoachTests } from '@/lib/coach/coach-tests';
import { createCoachTest, CoachTestError } from '@/lib/coach/write-coach-test';
import { coachTestCreateSchema } from '@fahybrid/shared/schema/coach-tests';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/coach/tests — the coach's calibration battery (coach_calibration_tests
// + their results + agenda), ordered for display. Source of truth for the Tests
// section + what the scheduler injects. snake_case.
export async function GET() {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const tests = await listCoachTests(session.coach_id, {});
  return jsonOk({ tests });
}

// POST /api/coach/tests — create a calibration test. Body = coachTestCreateSchema
// (name, protocol, format, results[], schedule[]). Writes the 3 tables + a content
// template + keeps meta_json.store_results in sync (the bridge reads it). Returns
// { test } with 201.
export async function POST(req: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = coachTestCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsed.error.flatten());
  }

  try {
    const test = await createCoachTest(session.coach_id, parsed.data);
    return jsonOk({ test }, 201);
  } catch (e) {
    if (e instanceof CoachTestError) return jsonError(e.code, e.message, e.status);
    throw e;
  }
}
