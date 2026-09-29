// GET /api/athlete/analytics/sesion/[executionId]
//
// El detalle de una sesión en las analíticas (docs/analiticas/modelo.md §3 fila
// 9): tramo a tramo lo prescrito frente a lo hecho, sus zonas y su carga con su
// peldaño, y la traza. El mismo cálculo (`cargarSesion`) que la ruta del coach.
//
// Auth: bearer del atleta. La ejecución se lee filtrada por él: una ajena o
// inexistente es 404, sin filtrar cuál de las dos.

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { parseRouteId } from '@/lib/coach/api-input';
import { desdeSesionDeAtleta } from '@/lib/analytics/atleta-verificado';
import { cargarSesion } from '@/lib/analytics/sesion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ executionId: string }> }) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const id = parseRouteId((await ctx.params).executionId, 'sesión');
  if (!id.ok) return id.response;

  const detalle = await cargarSesion({ atleta: desdeSesionDeAtleta(auth), execution_id: id.data });
  if (!detalle) return jsonError('not_found', 'Sesión no encontrada', 404);
  return jsonOk(detalle);
}
