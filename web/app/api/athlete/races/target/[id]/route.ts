import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { deleteAthleteTargetRace } from '@/lib/races/target-race-write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DELETE /api/athlete/races/target/:id — the athlete removes their target race.
// Scoped to ownership and to a pure future objective (planned/registered, no
// result): an imported/completed result can never be deleted here. Athlete bearer.
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return jsonError('bad_request', 'ID inválido', 400);

  const deleted = await deleteAthleteTargetRace({
    athlete_id: Number(auth.athlete_id),
    race_id: Number(id),
  });
  if (!deleted) return jsonError('not_found', 'Carrera objetivo no encontrada', 404);

  return jsonOk({ deleted: true });
}
