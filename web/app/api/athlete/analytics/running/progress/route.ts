import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  buildRunningProgress,
  PROGRESS_DEFAULT_WEEKS,
  PROGRESS_MAX_WEEKS,
} from '@/lib/athlete/analytics/running-progress';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/athlete/analytics/running/progress — «¿estoy mejorando?»
//
// POR QUÉ NO ES UNA SECCIÓN MÁS DE `/analytics/sections/running`
// --------------------------------------------------------------
// Esa ruta devuelve `AnalyticsSection`: una rejilla de tarjetas. Es exactamente
// la forma que la maqueta aprobada el 12-ago sustituyó, porque una pantalla de
// analíticas que hay que LEER ha fallado antes de empezar. Meter esto ahí
// obligaría a doblar aquel contrato hasta que dejara de describir lo que sirve,
// y rompería a los consumidores que ya dibujan tarjetas. Son dos contratos
// distintos porque contestan distinto: aquélla enumera métricas, ésta da UN
// veredicto y la evidencia que lo sostiene.
//
// UNA sola llamada trae la pantalla entera —veredicto, cobertura y los umbrales
// con los que se decidió— porque la coherencia entre las tres se decide en el
// servidor. Si el cliente pidiera el veredicto por un lado y las lecturas por
// otro, dos respuestas de instantes distintos podrían contradecirse en pantalla.
export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const url = new URL(request.url);
  const raw = url.searchParams.get('weeks');
  let weeks = PROGRESS_DEFAULT_WEEKS;
  if (raw != null) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > PROGRESS_MAX_WEEKS) {
      return jsonError('bad_request', `weeks debe ser un entero entre 1 y ${PROGRESS_MAX_WEEKS}`, 400);
    }
    weeks = n;
  }

  const progress = await buildRunningProgress({ athlete_id: Number(auth.athlete_id), weeks });
  return jsonOk(progress);
}
