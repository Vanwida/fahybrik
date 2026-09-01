import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  registerSensorCapture,
  sensorCaptureRegisterSchema,
} from '@/lib/sync/ingest-sensor-capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/sync/sensor-capture — registra el archivo ya subido al blob
// (fase 0). Los bytes van por PUT prefirmado; aquí solo la fila.
export async function POST(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'invalid JSON', 400);
  }

  const parsed = sensorCaptureRegisterSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'invalid payload', 400, parsed.error.flatten());
  }

  const result = await registerSensorCapture({
    athlete_id: Number(auth.athlete_id),
    payload: parsed.data,
  });

  if (!result.ok) {
    if (result.reason === 'no_consent') {
      return jsonError('forbidden', 'sensor capture consent required', 403);
    }
    if (result.reason === 'bad_pathname') {
      return jsonError('bad_request', 'invalid storage pathname', 400);
    }
    return jsonError('not_found', 'Execution not found', 404);
  }

  return jsonOk({ saved: true, id: result.id, execution_id: parsed.data.execution_id });
}
