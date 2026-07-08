import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  updateCoachTest,
  deleteCoachTest,
  CoachTestError,
} from '@/lib/coach/write-coach-test';
import { coachTestUpdateSchema } from '@fahybrid/shared/schema/coach-tests';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// PATCH /api/coach/tests/[id] — edit a calibration test (identity + results +
// schedule). Results/schedule are full replacements when present; the content
// template + meta_json are re-synced. Returns { test }.
export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const testId = parseId(id);
  if (testId === null) return jsonError('bad_request', 'id inválido', 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = coachTestUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsed.error.flatten());
  }

  try {
    const test = await updateCoachTest(session.coach_id, testId, parsed.data);
    if (!test) return jsonError('not_found', 'Test no encontrado', 404);
    return jsonOk({ test });
  } catch (e) {
    if (e instanceof CoachTestError) return jsonError(e.code, e.message, e.status);
    throw e;
  }
}

// DELETE /api/coach/tests/[id] — remove a test from the battery (soft-archive, so
// any already-scheduled assignment + its captured results survive). Returns { ok }.
export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const testId = parseId(id);
  if (testId === null) return jsonError('bad_request', 'id inválido', 400);

  const removed = await deleteCoachTest(session.coach_id, testId);
  if (!removed) return jsonError('not_found', 'Test no encontrado', 404);
  return jsonOk({ ok: true });
}
