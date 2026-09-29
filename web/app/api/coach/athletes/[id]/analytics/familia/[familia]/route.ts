// GET /api/coach/athletes/[id]/analytics/familia/{correr|remo|ski|bici|fuerza|estaciones}?ventana=
//
// El MISMO detalle de familia que ve el atleta, para su coach (A1: un cálculo,
// dos pintores). El ámbito de club se comprueba antes de leer nada: un atleta de
// otro club es un 404, sin decir si existe.

import { requireCoach } from '@/lib/auth/require-coach';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { parseRouteId } from '@/lib/coach/api-input';
import { verificarAtletaDelCoach } from '@/lib/analytics/atleta-verificado';
import { cargarDetalleFamilia } from '@/lib/analytics/progreso';
import { FAMILIAS_DETALLE, familiaDetalleAdmisible } from '@fahybrid/shared/domain/analytics/progreso-atleta';
import { VENTANA_PANEL_POR_DEFECTO, VENTANAS_PANEL, ventanaClaveAdmisible } from '@fahybrid/shared/domain/analytics/ventana';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string; familia: string }> }) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;

  const params = await ctx.params;
  const id = parseRouteId(params.id, 'atleta');
  if (!id.ok) return id.response;

  const familia = familiaDetalleAdmisible(params.familia);
  if (familia == null) {
    return jsonError('bad_request', `familia tiene que ser una de: ${FAMILIAS_DETALLE.join(', ')}`, 400);
  }
  const raw = new URL(request.url).searchParams.get('ventana');
  const ventana = raw == null ? VENTANA_PANEL_POR_DEFECTO : ventanaClaveAdmisible(raw);
  if (ventana == null) {
    return jsonError('bad_request', `ventana tiene que ser una de: ${VENTANAS_PANEL.join(', ')}`, 400);
  }

  const atleta = await verificarAtletaDelCoach(id.data, auth.session.coach_id);
  if (!atleta) return jsonError('not_found', 'Atleta no encontrado', 404);

  return jsonOk(await cargarDetalleFamilia({ atleta, ventana, familia }));
}
