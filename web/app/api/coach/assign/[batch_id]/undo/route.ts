// POST /api/coach/assign/[batch_id]/undo — deshacer un lote de «Asignar a varios»
// o de «Añadir al grupo». Cada atleta vuelve a como estaba (también lo que
// «Sustituir» cortó). Lo ya entrenado no se borra nunca: ese atleta no se deshace
// y la respuesta dice por qué. Deshacer dos veces es inofensivo.

import { requireCoach } from '@/lib/auth/require-coach';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { parseRouteId } from '@/lib/coach/api-input';
import { AssignManyError, undoAssignBatch } from '@/lib/coach/assign-many';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(_req: Request, ctx: { params: Promise<{ batch_id: string }> }) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const id = parseRouteId((await ctx.params).batch_id, 'asignación');
  if (!id.ok) return id.response;

  try {
    const result = await undoAssignBatch({
      coach_id: auth.session.coach_id,
      batch_id: id.data,
      user_id: auth.session.user_id,
      client: sql,
    });
    return jsonOk(result);
  } catch (err) {
    if (err instanceof AssignManyError) return jsonError(err.code, err.message, err.status);
    throw err;
  }
}
