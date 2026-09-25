// /api/athlete/sensor-consent — el permiso del atleta para subir el movimiento del
// reloj (DECISIONS 2026-09-25; `web/lib/sync/sensor-consent.ts`).
//
//   PUT    { version }  → lo da, para esa versión exacta del texto. 409 si la app
//                         manda una versión que ya no es la vigente.
//   DELETE              → lo retira y BORRA lo subido. Idempotente. 502 si el
//                         almacén no pudo borrar: la app reintenta hasta que sí.
//
// Auth: bearer del atleta; el atleta sale de la sesión, nunca de la petición.

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { captureRouteError } from '@/lib/observability/capture';
import { grantSensorConsent, sensorConsentGrantSchema, withdrawSensorConsent } from '@/lib/sync/sensor-consent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'invalid JSON', 400);
  }
  const parsed = sensorConsentGrantSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'invalid payload', 400, parsed.error.flatten());
  }

  const result = await grantSensorConsent({ athleteId: Number(auth.athlete_id), version: parsed.data.version });
  if (!result.ok) {
    return jsonError('stale_version', 'consent text version is not the current one', 409);
  }
  return jsonOk({ granted: true, version: result.version });
}

export async function DELETE(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  try {
    const result = await withdrawSensorConsent({ athleteId: Number(auth.athlete_id) });
    return jsonOk({ withdrawn: true, ...result });
  } catch (err) {
    captureRouteError(err, { route: 'api/athlete/sensor-consent', meta: { athlete_id: auth.athlete_id.toString() } });
    return jsonError('storage_unavailable', 'Could not erase uploaded motion files; retry', 502);
  }
}
