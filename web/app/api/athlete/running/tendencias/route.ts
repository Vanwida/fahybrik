import { z } from 'zod';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { buildRunningTendencias, TENDENCIAS_WINDOWS } from '@/lib/athlete/running/tendencias';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/athlete/running/tendencias?window=4w|6m|1y|all
//
// El "Reports" de Garmin de la pastilla Carrera: buckets semanales (4w/6m) o
// mensuales (1y/all), zero-filled, más `prev` (la ventana anterior del mismo
// largo) para las deltas. Ver web/lib/athlete/running/tendencias.ts.
const windowSchema = z.enum(TENDENCIAS_WINDOWS);

export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const url = new URL(request.url);
  const windowParsed = windowSchema.safeParse(url.searchParams.get('window') ?? '4w');
  if (!windowParsed.success) {
    return jsonError('bad_request', `window debe ser uno de: ${TENDENCIAS_WINDOWS.join(', ')}`, 400);
  }

  const tendencias = await buildRunningTendencias({
    athlete_id: Number(auth.athlete_id),
    window: windowParsed.data,
  });
  return jsonOk(tendencias);
}
