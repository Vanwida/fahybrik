// GET /api/athlete/analytics/familia/{correr|remo|ski|bici|fuerza|estaciones}?ventana=7d|4s|12s|6m|1a|todo
//
// El «¿mejoro?» a fondo de una familia (docs/analiticas/modelo.md §3 y §5): su
// fila del panel (la MISMA), sus métricas con la regla común, sus mejores y sus
// tests. Un solo cálculo (`cargarDetalleFamilia`) que también sirve la ruta del
// coach. Estaciones lleva también los WOD.

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { desdeSesionDeAtleta } from '@/lib/analytics/atleta-verificado';
import { cargarDetalleFamilia } from '@/lib/analytics/progreso';
import { FAMILIAS_DETALLE, familiaDetalleAdmisible } from '@fahybrid/shared/domain/analytics/progreso-atleta';
import { VENTANA_PANEL_POR_DEFECTO, VENTANAS_PANEL, ventanaClaveAdmisible } from '@fahybrid/shared/domain/analytics/ventana';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ familia: string }> }) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const familia = familiaDetalleAdmisible((await ctx.params).familia);
  if (familia == null) {
    return jsonError('bad_request', `familia tiene que ser una de: ${FAMILIAS_DETALLE.join(', ')}`, 400);
  }
  const raw = new URL(request.url).searchParams.get('ventana');
  const ventana = raw == null ? VENTANA_PANEL_POR_DEFECTO : ventanaClaveAdmisible(raw);
  if (ventana == null) {
    return jsonError('bad_request', `ventana tiene que ser una de: ${VENTANAS_PANEL.join(', ')}`, 400);
  }

  return jsonOk(await cargarDetalleFamilia({ atleta: desdeSesionDeAtleta(auth), ventana, familia }));
}
