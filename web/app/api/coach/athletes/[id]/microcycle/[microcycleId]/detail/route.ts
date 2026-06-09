import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import { loadMicrocycleDetail } from '@/lib/dashboard/coach/macro-progress';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MicrocycleIdSchema = z.object({
  microcycleId: z.string().regex(/^\d+$/, 'microcycle_id inválido'),
});

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string; microcycleId: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id, microcycleId } = await ctx.params;

  const parsedAthlete = AthleteIdParamSchema.safeParse({ id });
  if (!parsedAthlete.success) return jsonError('bad_request', 'ID atleta inválido', 400);

  const parsedMicro = MicrocycleIdSchema.safeParse({ microcycleId });
  if (!parsedMicro.success) return jsonError('bad_request', 'ID microciclo inválido', 400);

  // Verifica que el atleta pertenece al coach autenticado.
  const ownership = await sql<Array<{ id: string }>>`
    select id::text
    from athletes
    where id = ${Number(parsedAthlete.data.id)}
      and coach_id = ${session.coach_id}
    limit 1
  `;
  if (!ownership[0]) return jsonError('not_found', 'Atleta no encontrado', 404);

  const detail = await loadMicrocycleDetail({
    athlete_id: Number(parsedAthlete.data.id),
    microcycle_id: Number(parsedMicro.data.microcycleId),
  });

  if (!detail) return jsonError('not_found', 'Microciclo no encontrado', 404);

  return jsonOk({ detail });
}
