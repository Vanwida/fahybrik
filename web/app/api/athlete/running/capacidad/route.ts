import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { buildRunningCapacidad } from '@/lib/athlete/running/capacidad';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/athlete/running/capacidad
//
// Umbral+zonas, récords y el predictor 5k/10k/21k/42k — la puerta "¿qué me
// da hoy?" de la pastilla Carrera. Sin query params: es SIEMPRE el estado
// actual del atleta. Ver web/lib/athlete/running/capacidad.ts para el
// contrato completo, por qué NO lleva velocidad crítica (esa lectura vive en
// /api/athlete/analytics/lecturas) y la desviación declarada
// (`records[].valor`+`unidad` en vez de un `segundos` que mentiría en el
// Cooper, que se mide en metros).
export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const capacidad = await buildRunningCapacidad({ athlete_id: Number(auth.athlete_id) });
  return jsonOk(capacidad);
}
