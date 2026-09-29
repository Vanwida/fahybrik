// GET /api/athlete/analytics/panel?ventana=7d|4s|12s|6m|1a|todo
//
// EL panel de analíticas del atleta (docs/analiticas/modelo.md §5): un solo
// cálculo (`cargarPanel`) que también sirve la ruta del coach. Sustituye a los
// siete contratos anteriores cuando las dos superficies nuevas estén en
// producción; hasta entonces conviven (§9).

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { desdeSesionDeAtleta } from '@/lib/analytics/atleta-verificado';
import { cargarPanel } from '@/lib/analytics/panel';
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

  return jsonOk(await cargarPanel({ atleta: desdeSesionDeAtleta(auth), ventana }));
}
