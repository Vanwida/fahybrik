// POST /api/coach/tests/[id]/apply
//
// Put this test in the plan of one or more of the coach's athletes, on a date, with an
// optional re-test N weeks later. The action the dashboard was missing entirely: before
// this, a test only ever reached an athlete through the week-1 auto-scheduler, which
// fires once and never again.
//
// Authorization is re-derived server-side on both sides (the test must be the caller's,
// every athlete is re-resolved through athletes.coach_id) — the body is a request, not
// a source of truth.

import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { captureRouteError } from '@/lib/observability/capture';
import { applyTestToAthletes, type ApplyTestError } from '@/lib/coach/apply-test';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z
  .object({
    athlete_ids: z.array(z.union([z.number().int().positive(), z.string().regex(/^\d+$/)])).min(1).max(200),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
    /** Weeks until the re-test. 0 / omitted = no repeat. Capped at a year. */
    repeat_in_weeks: z.number().int().min(0).max(52).optional().nullable(),
  })
  .strict();

const STATUS: Record<ApplyTestError, number> = {
  test_not_found: 404,
  test_not_ready: 409,
  no_athletes: 400,
};

const MESSAGE: Record<ApplyTestError, string> = {
  test_not_found: 'Ese test no existe',
  test_not_ready: 'Ese test todavía no tiene contenido que ejecutar',
  no_athletes: 'Ningún atleta válido en la selección',
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const test_id = Number(id);
  if (!Number.isInteger(test_id) || test_id <= 0) {
    return jsonError('invalid_id', 'Test inválido', 400);
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError('invalid_body', 'Datos inválidos', 400, parsed.error.flatten());
  }

  try {
    const result = await applyTestToAthletes({
      coach_id: Number(session.coach_id),
      test_id,
      athlete_ids: parsed.data.athlete_ids.map(Number),
      date: parsed.data.date,
      repeat_in_weeks: parsed.data.repeat_in_weeks ?? null,
    });
    if (!result.ok) return jsonError(result.error, MESSAGE[result.error], STATUS[result.error]);
    return jsonOk(result.data);
  } catch (err) {
    captureRouteError(err, { route: 'api/coach/tests/[id]/apply.POST', meta: { test_id } });
    return jsonError('apply_failed', 'No pudimos programar el test', 500);
  }
}
