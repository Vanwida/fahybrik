import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import { athleteTargetRaceInput } from '@fahybrid/shared/schema';
import {
  setAthleteTargetRace,
  TargetRaceError,
} from '@/lib/races/target-race-write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/coach/athletes/[id]/races/target — the coach sets one of their
// athletes' target race from the catalog. Reuses the same write path as the
// athlete endpoint (single source of truth); only the auth + ownership gate and
// the visibility relaxation (Pablo may target any event) differ.
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID inválido', 400);
  const athleteId = Number(parsedId.data.id);

  // Ownership: never let a coach touch another coach's athlete.
  const owner = await sql<{ id: string }[]>`
    select a.id::text
    from athletes a
    where a.id = ${athleteId} and a.coach_id = ${session.coach_id as unknown as number}
    limit 1
  `;
  if (!owner[0]) return jsonError('not_found', 'Atleta no encontrado', 404);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = athleteTargetRaceInput.safeParse(raw);
  if (!parsed.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsed.error.flatten());
  }

  try {
    const result = await setAthleteTargetRace({
      athlete_id: athleteId,
      event_id: parsed.data.event_id,
      format: parsed.data.format,
      division: parsed.data.division,
      gender_category: parsed.data.gender_category,
      goal_time_seconds: parsed.data.goal_time_seconds ?? null,
      require_visible: false,
    });
    return jsonOk(result);
  } catch (err) {
    if (err instanceof TargetRaceError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}
