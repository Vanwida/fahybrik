// POST /api/athlete/lifecycle/pause     — pause my plan, no coach confirmation
// POST /api/athlete/lifecycle/pause/resume lives in ../resume
//
// Athlete-authenticated and self-service on purpose (#13): pausing stops the billing,
// so making it depend on a coach confirming it would mean the athlete pays while
// waiting for a reply. The only gate is the pause budget, and it is enforced in
// lib/athlete/lifecycle-self-service.ts so the coach's own pause path keeps its
// override.

import { z } from 'zod';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { captureRouteError } from '@/lib/observability/capture';
import { pauseSelf } from '@/lib/athlete/lifecycle-self-service';
import { LifecycleError } from '@/lib/coach/athlete-lifecycle';
import { PAUSE_REASONS } from '@fahybrid/shared/domain/coach/athlete-lifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z
  .object({
    reason: z.enum(PAUSE_REASONS),
    /** The day the athlete trains again. Required — an open-ended pause is a baja nobody declared. */
    return_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

export async function POST(req: Request): Promise<Response> {
  const auth = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Athlete session required', 401);

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError('invalid_body', 'Datos inválidos', 400, parsed.error.flatten());
  }

  try {
    const result = await pauseSelf({
      athlete_id: auth.athlete_id,
      user_id: auth.user_id,
      reason: parsed.data.reason,
      return_date: parsed.data.return_date,
      note: parsed.data.note ?? null,
    });
    return jsonOk(result);
  } catch (err) {
    if (err instanceof LifecycleError) return jsonError(err.code, err.message, err.status);
    captureRouteError(err, { route: 'api/athlete/lifecycle/pause.POST' });
    return jsonError('pause_failed', 'No pudimos pausar tu plan', 500);
  }
}
