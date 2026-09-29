// GET /api/athlete/analytics/records?ventana=7d|4s|12s|6m|1a|todo
//
// ¿Qué marcas tengo? (docs/analiticas/modelo.md §3 fila 6): la lista única de
// récords de todas las familias con lo conseguido en la ventana marcado como
// nuevo, y la evolución de cada test. Un récord es de siempre: la ventana solo
// decide qué es nuevo. El mismo cálculo (`cargarRecords`) sirve al coach.

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { desdeSesionDeAtleta } from '@/lib/analytics/atleta-verificado';
import { cargarRecords } from '@/lib/analytics/progreso';
import { VENTANA_PANEL_POR_DEFECTO, VENTANAS_PANEL, ventanaClaveAdmisible } from '@fahybrid/shared/domain/analytics/ventana';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const raw = new URL(request.url).searchParams.get('ventana');
  const ventana = raw == null ? VENTANA_PANEL_POR_DEFECTO : ventanaClaveAdmisible(raw);
  if (ventana == null) {
    return jsonError('bad_request', `ventana tiene que ser una de: ${VENTANAS_PANEL.join(', ')}`, 400);
  }

  return jsonOk(await cargarRecords({ atleta: desdeSesionDeAtleta(auth), ventana }));
}
