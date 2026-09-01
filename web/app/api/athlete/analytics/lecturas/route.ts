import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  ANALYTICS_DEFAULT_WEEKS,
  ANALYTICS_MAX_WEEKS,
  buildAnaliticasAtleta,
} from '@/lib/athlete/analytics/lecturas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/athlete/analytics/lecturas — las analíticas del atleta, COMPLETAS.
//
// POR QUÉ UNA RUTA NUEVA Y NO UNA SECCIÓN MÁS
// -------------------------------------------
// Ya hay tres contratos de analíticas y ninguno sirve para esto:
//   · `/analytics` devuelve totales por modalidad, sin cobertura ni procedencia.
//   · `/analytics/sections/[section]` devuelve una REJILLA DE TARJETAS con los
//     textos ya formateados por el servidor — la forma que la maqueta del 12-ago
//     sustituyó, porque una pantalla de analíticas que hay que LEER ya falló.
//   · `/analytics/running/progress` da UN veredicto sobre carrera, con la raíz
//     fijada campo a campo. Añadirle sueño o carga sería doblar aquel contrato
//     hasta que dejara de describir lo que sirve.
//
// Ésta devuelve una LISTA de lecturas, cada una con su cobertura y su
// procedencia al lado. Una lectura nueva es un elemento más del array: aparece
// sin tocar el cliente, y el cliente ignora la que no sabe dibujar sin romperse.
// Ver la cabecera de `shared/domain/analytics/lectura.ts`.
//
// UNA sola llamada trae la pantalla entera —las tres familias y el método con el
// que se decidieron— porque la coherencia entre ellas se decide en el servidor.
// Pedirlas por separado permitiría que dos respuestas de instantes distintos se
// contradijeran en la misma pantalla.
export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const url = new URL(request.url);
  const raw = url.searchParams.get('weeks');
  let weeks = ANALYTICS_DEFAULT_WEEKS;
  if (raw != null) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > ANALYTICS_MAX_WEEKS) {
      return jsonError('bad_request', `weeks debe ser un entero entre 1 y ${ANALYTICS_MAX_WEEKS}`, 400);
    }
    weeks = n;
  }

  const analiticas = await buildAnaliticasAtleta({ athlete_id: Number(auth.athlete_id), weeks });
  return jsonOk(analiticas);
}
