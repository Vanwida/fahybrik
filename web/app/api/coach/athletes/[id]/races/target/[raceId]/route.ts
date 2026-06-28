import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import { deleteAthleteTargetRace } from '@/lib/races/target-race-write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DELETE /api/coach/athletes/[id]/races/target/[raceId] — the coach removes one
// of their athlete's FUTURE objectives (planned/registered, no result). Reuses
// the shared deleteAthleteTargetRace write path (single source of truth) behind
// the coach auth + ownership gate, mirroring the athlete DELETE. A completed or
// imported result can never be deleted through this path.
export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string; raceId: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id, raceId } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID inválido', 400);
  if (!/^\d+$/.test(raceId)) {
    return jsonError('bad_request', 'ID de carrera inválido', 400);
  }
  const athleteId = Number(parsedId.data.id);

  // Ownership: never let a coach touch another coach's athlete.
  const owner = await sql<{ id: string }[]>`
    select a.id::text
    from athletes a
    where a.id = ${athleteId} and a.coach_id = ${session.coach_id as unknown as number}
    limit 1
  `;
  if (!owner[0]) return jsonError('not_found', 'Atleta no encontrado', 404);

  const deleted = await deleteAthleteTargetRace({
    athlete_id: athleteId,
    race_id: Number(raceId),
  });
  if (!deleted) return jsonError('not_found', 'Objetivo no encontrado', 404);

  return jsonOk({ deleted: true });
}
