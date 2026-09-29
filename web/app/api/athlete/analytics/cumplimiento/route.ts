// GET /api/athlete/analytics/cumplimiento?ventana=7d|4s|12s|6m|1a|todo
//
// El DETALLE del cumplimiento (docs/analiticas/modelo.md §3 fila 3, A7/A8): las
// mismas lecturas del bloque `semanas` del panel y sus filas — cada sesión del
// plan con su color y su base, y dentro sus líneas y sus tramos, prescrito frente
// a hecho, serie a serie. Un solo cálculo (`cargarDetalleCumplimiento`) que
// también sirve la ruta del coach.

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { desdeSesionDeAtleta } from '@/lib/analytics/atleta-verificado';
import { cargarDetalleCumplimiento } from '@/lib/analytics/cumplimiento';
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

  return jsonOk(await cargarDetalleCumplimiento({ atleta: desdeSesionDeAtleta(auth), ventana }));
}
