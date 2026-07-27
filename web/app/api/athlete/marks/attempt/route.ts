// POST /api/athlete/marks/attempt — "Probarme" finished (#Marcas).
//
// The app measured the value (GPS, treadmill belt or PM5 — never typed by the
// athlete) and reports it here. Records with source='athlete_test', answers with
// is_pr + the previous best so the result screen can say "5 s menos", and tells
// the coach through the notification funnel. Never recalibrates the plan.

import { z } from 'zod';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { captureRouteError } from '@/lib/observability/capture';
import { recordMarkAttempt, type MarkWriteError } from '@/lib/athlete/marks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z
  .object({
    slug: z.string().min(1).max(60),
    /** Seconds for time trials, meters for Cooper. Bounds live in the shared catalog. */
    value: z.number().positive(),
    run_context: z.enum(['outdoor', 'treadmill']).optional().nullable(),
  })
  .strict();

const STATUS: Partial<Record<MarkWriteError, number>> = {
  unknown_mark: 404,
  not_self_testable: 409,
  invalid_value: 422,
};

export async function POST(req: Request): Promise<Response> {
  const auth = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Athlete session required', 401);

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError('invalid_body', 'Datos inválidos', 400, parsed.error.flatten());
  }

  try {
    const result = await recordMarkAttempt({
      athlete_id: auth.athlete_id,
      slug: parsed.data.slug,
      value: parsed.data.value,
      run_context: parsed.data.run_context ?? null,
    });
    if (!result.ok) {
      return jsonError(result.error, 'No pudimos guardar la marca', STATUS[result.error] ?? 400);
    }
    return jsonOk(result.data);
  } catch (err) {
    captureRouteError(err, { route: 'api/athlete/marks/attempt.POST' });
    return jsonError('mark_write_failed', 'No pudimos guardar la marca', 500);
  }
}
