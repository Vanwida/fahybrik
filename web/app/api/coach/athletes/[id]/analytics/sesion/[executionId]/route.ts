// GET /api/coach/athletes/[id]/analytics/sesion/[executionId]
//
// El MISMO detalle de sesión que ve el atleta, para su coach (A1: un cálculo,
// dos pintores). El ámbito de club se comprueba antes de leer nada: un atleta de
// otro club, o una sesión que no es de este atleta, es un 404 sin decir cuál.

import { requireCoach } from '@/lib/auth/require-coach';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { parseRouteId } from '@/lib/coach/api-input';
import { verificarAtletaDelCoach } from '@/lib/analytics/atleta-verificado';
import { cargarSesion } from '@/lib/analytics/sesion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, ctx: { params: Promise<{ id: string; executionId: string }> }) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;

  const params = await ctx.params;
  const atletaId = parseRouteId(params.id, 'atleta');
  if (!atletaId.ok) return atletaId.response;
  const sesionId = parseRouteId(params.executionId, 'sesión');
  if (!sesionId.ok) return sesionId.response;

  const atleta = await verificarAtletaDelCoach(atletaId.data, auth.session.coach_id);
  if (!atleta) return jsonError('not_found', 'Atleta no encontrado', 404);

  const detalle = await cargarSesion({ atleta, execution_id: sesionId.data });
  if (!detalle) return jsonError('not_found', 'Sesión no encontrada', 404);
  return jsonOk(detalle);
}
