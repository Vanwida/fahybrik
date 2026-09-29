// GET /api/coach/athletes/[id]/thresholds → { anclas, declaraciones }
// PUT /api/coach/athletes/[id]/thresholds   body: { kind, value | null, note? }
//
// Los mismos umbrales que ve el atleta, y el mismo toque para declararlos —
// desde la ficha del coach, con el ámbito de club comprobado antes de leer o
// escribir (un atleta de otro club es un 404).

import { requireCoach } from '@/lib/auth/require-coach';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { parseBody, parseRouteId } from '@/lib/coach/api-input';
import { verificarAtletaDelCoach } from '@/lib/analytics/atleta-verificado';
import { declararUmbral, getUmbralesAtleta } from '@/lib/analytics/declaraciones';
import { declaracionUmbralSchema } from '@fahybrid/shared/domain/analytics/declaracion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const id = parseRouteId((await ctx.params).id, 'atleta');
  if (!id.ok) return id.response;
  const atleta = await verificarAtletaDelCoach(id.data, auth.session.coach_id);
  if (!atleta) return jsonError('not_found', 'Atleta no encontrado', 404);
  return jsonOk(await getUmbralesAtleta(atleta));
}

export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const id = parseRouteId((await ctx.params).id, 'atleta');
  if (!id.ok) return id.response;
  const atleta = await verificarAtletaDelCoach(id.data, auth.session.coach_id);
  if (!atleta) return jsonError('not_found', 'Atleta no encontrado', 404);
  const body = await parseBody(request, declaracionUmbralSchema);
  if (!body.ok) return body.response;
  return jsonOk(await declararUmbral(atleta, body.data));
}
