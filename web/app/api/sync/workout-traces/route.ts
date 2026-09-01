import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  ingestWorkoutTraces,
  workoutTracesPayloadSchema,
} from '@/lib/sync/ingest-workout-traces';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/sync/workout-traces — el atleta sube las SERIES de un entreno ya
// registrado: el pulso latido a latido, el ritmo, la potencia. Una fila por
// (ejecución, señal, fuente), así que reenviar el mismo entreno actualiza y
// nunca duplica.
//
// El registro del entreno va por /api/sync/workout-execution y crea la
// ejecución; esto cuelga de ella. Separado a propósito: la serie pesa mucho más
// que el resumen y un fallo subiéndola no puede tumbar el guardado del entreno.
export async function POST(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'invalid JSON', 400);
  }

  const parsed = workoutTracesPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'invalid payload', 400, parsed.error.flatten());
  }

  const result = await ingestWorkoutTraces({
    athlete_id: Number(auth.athlete_id),
    payload: parsed.data,
  });
  if (!result.ok) return jsonError('not_found', 'Execution not found', 404);

  return jsonOk({
    saved: true,
    execution_id: parsed.data.execution_id,
    traces_saved: result.traces_saved,
    zones_recomputed: result.zones_recomputed,
    header_recomputed: result.header_recomputed,
  });
}
