// POST   /api/athlete/lifecycle/baja  — I want to leave
// DELETE /api/athlete/lifecycle/baja  — actually, I'm staying
//
// The baja is SCHEDULED for the end of the paid period, not applied on the spot: the
// athlete keeps the plan, the chat and their coach until the last day they paid for,
// and can take it back with one tap until then. See lib/athlete/lifecycle-self-service.
//
// No retention theatre in this path — no discount, no "are you sure" three times. The
// one thing the screen tells them is the thing they don't know: that they don't lose
// what they already paid.

import { z } from 'zod';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { captureRouteError } from '@/lib/observability/capture';
import { cancelScheduledBaja, scheduleBajaSelf } from '@/lib/athlete/lifecycle-self-service';
import { LifecycleError } from '@/lib/coach/athlete-lifecycle';
import { PAUSE_REASONS } from '@fahybrid/shared/domain/coach/athlete-lifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({ reason: z.enum(PAUSE_REASONS) }).strict();

export async function POST(req: Request): Promise<Response> {
  const auth = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Athlete session required', 401);

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError('invalid_body', 'Datos inválidos', 400, parsed.error.flatten());
  }

  try {
    const result = await scheduleBajaSelf({
      athlete_id: auth.athlete_id,
      user_id: auth.user_id,
      reason: parsed.data.reason,
    });
    return jsonOk(result);
  } catch (err) {
    if (err instanceof LifecycleError) return jsonError(err.code, err.message, err.status);
    captureRouteError(err, { route: 'api/athlete/lifecycle/baja.POST' });
    return jsonError('baja_failed', 'No pudimos tramitar tu baja', 500);
  }
}

export async function DELETE(req: Request): Promise<Response> {
  const auth = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Athlete session required', 401);

  try {
    const result = await cancelScheduledBaja({
      athlete_id: auth.athlete_id,
      user_id: auth.user_id,
    });
    return jsonOk(result);
  } catch (err) {
    if (err instanceof LifecycleError) return jsonError(err.code, err.message, err.status);
    captureRouteError(err, { route: 'api/athlete/lifecycle/baja.DELETE' });
    return jsonError('baja_cancel_failed', 'No pudimos cancelar tu baja', 500);
  }
}
