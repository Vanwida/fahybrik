// GET /api/coach/athletes/[id]/analytics/panel?ventana=7d|4s|12s|6m|1a|todo
//
// El MISMO panel que ve el atleta, para su coach (A1: un cálculo, dos pintores).
// El ámbito de club se comprueba antes de leer nada: un atleta de otro club es
// un 404, sin decir si existe.

import { requireCoach } from '@/lib/auth/require-coach';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { parseRouteId } from '@/lib/coach/api-input';
import { verificarAtletaDelCoach } from '@/lib/analytics/atleta-verificado';
import { cargarPanel } from '@/lib/analytics/panel';
import { VENTANA_PANEL_POR_DEFECTO, VENTANAS_PANEL, ventanaClaveAdmisible } from '@fahybrid/shared/domain/analytics/ventana';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;

  const id = parseRouteId((await ctx.params).id, 'atleta');
  if (!id.ok) return id.response;

  const raw = new URL(request.url).searchParams.get('ventana');
  const ventana = raw == null ? VENTANA_PANEL_POR_DEFECTO : ventanaClaveAdmisible(raw);
  if (ventana == null) {
    return jsonError('bad_request', `ventana tiene que ser una de: ${VENTANAS_PANEL.join(', ')}`, 400);
  }

  const atleta = await verificarAtletaDelCoach(id.data, auth.session.coach_id);
  if (!atleta) return jsonError('not_found', 'Atleta no encontrado', 404);

  return jsonOk(await cargarPanel({ atleta, ventana }));
}
