// GET /api/athlete/wearables/garmin/workouts   (bearer de atleta)
//
// Las sesiones de CARRERA que el atleta tiene por delante (semana en curso + la
// siguiente, de hoy en adelante), para que la app del reloj deje elegir cuál
// descargar en vez de servir solo la de hoy a ciegas.
//
//   200 { "workouts": [ { "assignment_id": "…", "iso_date": "2026-07-25",
//                         "title": "Series 6×400", "is_today": true } ] }
//   401 unauthorized
//
// Es un listado, no una promesa: se filtra por la modalidad que ya deriva el plan
// semanal, así que una sesión puede aparecer aquí y aun así no traer estructura de
// carrera. La autoridad es el endpoint del fichero, que responde 409 en ese caso.

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { listUpcomingRunSessions } from '@/lib/wearables/watch-workout-source';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const workouts = await listUpcomingRunSessions(auth.athlete_id);
  return jsonOk({ workouts });
}
