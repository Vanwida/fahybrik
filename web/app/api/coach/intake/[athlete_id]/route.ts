import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { commitIntake, IntakeError, loadIntakeProfile } from '@/lib/coach/intake';
import { proposeFirstMonthForIntake } from '@/lib/coach/intake-month-proposal';
import { computeAndStoreLevelSuggestion } from '@/lib/coach/level-proposal';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ athlete_id: string }>;
}

function parseAthleteId(raw: string): bigint | null {
  if (!/^\d+$/.test(raw)) return null;
  try {
    const n = BigInt(raw);
    return n > BigInt(0) ? n : null;
  } catch {
    return null;
  }
}

export async function GET(_req: Request, ctx: Ctx) {
  const session = await getCoachSession();
  if (!session) {
    return jsonError('unauthorized', 'Coach session required', 401);
  }
  const { athlete_id } = await ctx.params;
  const id = parseAthleteId(athlete_id);
  if (id == null) {
    return jsonError('invalid_id', 'athlete_id must be a positive integer', 400);
  }

  try {
    const profile = await loadIntakeProfile({
      athlete_id: id,
      coach_id: session.coach_id,
    });
    // The athlete's level = athlete_levels (level_id), preferring the coach's
    // assigned level over the algorithm's suggestion. The month proposal selects a
    // microciclo template tagged with that same level_id; null when no level yet.
    const levelRows = await sql<Array<{ level_id: string | null }>>`
      select coalesce(a.level_id, a.suggested_level_id)::text as level_id
      from athletes a
      where a.id = ${Number(id)} and a.coach_id = ${Number(session.coach_id)}
      limit 1
    `;
    const levelId = levelRows[0]?.level_id ?? null;
    const month_proposal = levelId
      ? await proposeFirstMonthForIntake({
          coach_id: session.coach_id,
          athlete_id: id,
          level_id: Number(levelId),
        })
      : null;
    return jsonOk({ profile, month_proposal });
  } catch (err) {
    if (err instanceof IntakeError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const session = await getCoachSession();
  if (!session) {
    return jsonError('unauthorized', 'Coach session required', 401);
  }
  const { athlete_id } = await ctx.params;
  const id = parseAthleteId(athlete_id);
  if (id == null) {
    return jsonError('invalid_id', 'athlete_id must be a positive integer', 400);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json', 'Body must be valid JSON', 400);
  }

  let result;
  try {
    result = await commitIntake({
      athlete_id: id,
      coach_id: session.coach_id,
      coach_user_id: session.user_id,
      payload: body,
    });
  } catch (err) {
    if (err instanceof IntakeError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }

  // Fire-and-forget: compute and persist the algorithmic level suggestion for
  // this athlete. Runs after the response is formed so it never delays the
  // intake commit. Errors are logged to server stderr, not surfaced to Pablo.
  computeAndStoreLevelSuggestion(
    Number(id),
    Number(session.coach_id),
  ).catch((e: unknown) => {
    console.error('[level-proposal] computeAndStoreLevelSuggestion failed', e);
  });

  return jsonOk(result);
}
