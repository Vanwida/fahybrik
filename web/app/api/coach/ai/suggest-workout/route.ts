import { jsonError, jsonOk } from '@/lib/api/responses';
import { getCoachSession } from '@/lib/auth/coach-session';
import { sql } from '@/lib/db';
import { getLevelAxisSetting } from '@/lib/coach/level-axis';
import { isCoachIaLlmConfigured } from '@/lib/dashboard/coach/ai/llm';
import { SuggestWorkoutError, suggestWorkout } from '@/lib/dashboard/coach/ai/suggest-workout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// GET — si el modo «Completo» está disponible y los niveles DEL COACH (su eje,
// con su nombre) para elegir; con ?athlete_id=, el nivel de ese atleta como
// punto de partida. Nunca una escala fija.
export async function GET(request: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);
  const coach_id = Number(session.coach_id);
  const rawAthlete = new URL(request.url).searchParams.get('athlete_id');
  const athleteId = rawAthlete && /^\d+$/.test(rawAthlete) ? Number(rawAthlete) : null;

  const [levels, axis, athlete] = await Promise.all([
    sql<Array<{ id: string; name: string; label: string }>>`
      select id::text, name, label from athlete_levels
      where coach_id = ${coach_id} and archived_at is null
      order by sort_order, id
    `,
    getLevelAxisSetting(coach_id),
    athleteId != null
      ? sql<Array<{ level_id: string | null }>>`
          select coalesce(a.level_id, a.suggested_level_id)::text as level_id
          from athletes a where a.id = ${athleteId} and a.coach_id = ${coach_id} limit 1
        `
      : Promise.resolve([] as Array<{ level_id: string | null }>),
  ]);
  const athleteLevel = athlete[0]?.level_id ?? null;
  return jsonOk({
    llm_configured: isCoachIaLlmConfigured(),
    levels,
    axis_label: axis.effective_label,
    athlete_level_id: athleteLevel && levels.some((l) => l.id === athleteLevel) ? athleteLevel : null,
  });
}

export async function POST(request: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  try {
    const suggestion = await suggestWorkout({
      coach_id: session.coach_id,
      body,
    });
    return jsonOk({ suggestion });
  } catch (err) {
    if (err instanceof SuggestWorkoutError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}
