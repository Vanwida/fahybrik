// POST /api/devices/events — el móvil manda en lotes el registro técnico de los
// dos aparatos (los eventos del reloj llegan por él). Fase 0 del diseño
// Watch-first; `web/lib/devices/device-events.ts` y la migración 0273.
//
// Auth: bearer del atleta. 2xx = el lote entero está guardado (lo nuevo y lo que
// ya estaba): el aparato lo puede soltar. 400 = el lote no se puede leer: el
// aparato no lo reintenta tal cual.

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { withRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/security/rate-limit';
import { captureRouteError } from '@/lib/observability/capture';
import { deviceEventsBatchSchema, deviceEventsLogLine, recordDeviceEvents } from '@/lib/devices/device-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const rl = await withRateLimit({
    scope: 'user',
    identifier: String(auth.user_id),
    ...RATE_LIMITS.deviceEvents,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'invalid JSON', 400);
  }
  const parsed = deviceEventsBatchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'invalid payload', 400, parsed.error.flatten());
  }

  try {
    const result = await recordDeviceEvents({ athleteId: auth.athlete_id, events: parsed.data.events });
    // La línea que se lee desde Vercel (ver deviceEventsLogLine).
    console.info('[device_events]', deviceEventsLogLine(auth.athlete_id, parsed.data.events));
    return jsonOk(result);
  } catch (err) {
    captureRouteError(err, { route: 'api/devices/events', meta: { athlete_id: auth.athlete_id.toString() } });
    return jsonError('internal', 'Could not store device events', 500);
  }
}
