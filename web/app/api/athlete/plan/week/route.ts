import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { buildAthleteMacroSummary } from '@/lib/coach/macro-progress';
import { getNextRace, getTargetRace } from '@/lib/races/next-race';
import { buildAthleteWeekPlan } from '@/lib/athlete/week-plan';
import {
  resolveAthletePlanWeekVisibility,
  wallMessageForOffsetDenied,
} from '@/lib/athlete/plan-week-visibility';
import { planWeekHorizonWallMessage } from '@fahybrid/shared/domain/coach/plan-week-horizon';
import type { AthletePlanWeekVisibility } from '@fahybrid/shared/schema/coach-plan-week-horizon';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseWeekOffset(request: Request): number {
  const raw = new URL(request.url).searchParams.get('week_offset');
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const weekOffset = parseWeekOffset(request);
  const baseVisibility = await resolveAthletePlanWeekVisibility(auth.athlete_id);

  if (weekOffset > baseVisibility.max_week_offset) {
    return jsonError(
      'plan_horizon_exceeded',
      wallMessageForOffsetDenied(baseVisibility),
      403,
      {
        plan_visibility: {
          max_week_offset: baseVisibility.max_week_offset,
          horizon: baseVisibility.horizon,
          peek_blocked_by_horizon: true,
          wall_message: wallMessageForOffsetDenied(baseVisibility),
        },
      },
    );
  }

  const summary = await buildAthleteMacroSummary({ athlete_id: auth.athlete_id });
  const week = await buildAthleteWeekPlan(auth.athlete_id, weekOffset, baseVisibility);
  const coach_name = await getCoachName(auth.athlete_id);

  const plan_visibility: AthletePlanWeekVisibility = {
    max_week_offset: baseVisibility.max_week_offset,
    horizon: baseVisibility.horizon,
    peek_blocked_by_horizon: week.peek_blocked_by_horizon,
    wall_message: week.peek_blocked_by_horizon
      ? baseVisibility.horizon
        ? planWeekHorizonWallMessage(baseVisibility.horizon)
        : null
      : null,
  };

  const [target_race, next_race] = await Promise.all([
    getTargetRace(auth.athlete_id),
    getNextRace(auth.athlete_id),
  ]);

  return jsonOk({
    week,
    macro_summary: summary,
    coach_name,
    target_race,
    next_race,
    plan_visibility,
  });
}

async function getCoachName(athlete_id: number | bigint): Promise<string | null> {
  const rows = await sql<{ full_name: string | null }[]>`
    select c.full_name
    from athletes a
    join coaches c on c.id = a.coach_id
    where a.id = ${athlete_id as number}
    limit 1
  `;
  return rows[0]?.full_name ?? null;
}
