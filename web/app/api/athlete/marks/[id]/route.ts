// DELETE /api/athlete/marks/[id] — el atleta retira una marca de su biblioteca.
//
// Existe por lo que el atleta declara al entrar: ese número es SUYO y tiene que
// poder quitarlo (si no, un dato tecleado con prisa el primer día se queda para
// siempre mandando en su mejor marca). La regla que aplica es más amplia: todo lo
// que produjo él se puede retirar, el test del coach no — ver
// `markIsDeletableByAthlete` en shared/domain/athlete/marks.
//
// La propiedad se comprueba en el WHERE (athlete_id de la sesión). Una id ajena o
// inexistente no borra nada y sale por 404, NUNCA 403, para no filtrar si existe.

import type { NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { deleteAthleteMark } from '@/lib/athlete/marks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

function parseId(raw: string): bigint | null {
  if (!/^\d+$/.test(raw)) return null;
  try {
    const n = BigInt(raw);
    return n > BigInt(0) ? n : null;
  } catch {
    return null;
  }
}

export async function DELETE(req: Request, ctx: Ctx): Promise<NextResponse> {
  const athlete = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!athlete) return jsonError('unauthorized', 'Athlete bearer required', 401);

  const { id } = await ctx.params;
  const markId = parseId(id);
  if (markId == null) return jsonError('invalid_id', 'id must be a positive integer', 400);

  try {
    const result = await deleteAthleteMark({ athlete_id: athlete.athlete_id, id: markId });
    if (!result.ok) {
      if (result.error === 'not_yours_to_delete') {
        return jsonError(
          'not_yours_to_delete',
          'Esa marca la registró tu coach. Habla con él para cambiarla.',
          409,
        );
      }
      return jsonError('not_found', 'Marca no encontrada', 404);
    }
    return jsonOk({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/athlete/marks/[id]]', err);
    return jsonError('delete_failed', 'No se pudo retirar la marca.', 500);
  }
}
