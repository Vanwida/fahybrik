import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { buildAthleteMacroSummary } from '@/lib/coach/macro-progress';
import { getNextRace, getTargetRace } from '@/lib/races/next-race';
import { buildAthleteWeekPlan } from '@/lib/athlete/week-plan';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Weekly-delivery model: the athlete sees THIS week and may PEEK the next one
// (the week that unlocks Saturday) — only the next, never arbitrary navigation.
// So we accept a single bounded offset: 0 = this week (default), 1 = next week.
const MAX_WEEK_OFFSET = 1;

function parseWeekOffset(request: Request): number {
  const raw = new URL(request.url).searchParams.get('week_offset');
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_WEEK_OFFSET, Math.max(0, Math.trunc(n)));
}

export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const weekOffset = parseWeekOffset(request);
  const summary = await buildAthleteMacroSummary({ athlete_id: auth.athlete_id });
  // Single source of truth for "the athlete's week" (lib/athlete/week-plan.ts),
  // shared with the Dobles connected plan so the two never diverge.
  const week = await buildAthleteWeekPlan(auth.athlete_id, weekOffset);
  const coach_name = await getCoachName(auth.athlete_id);

  // RACE countdown. `target_race` = the goal the plan peaks to; `next_race` =
  // the soonest race on the calendar (may be an intermediate tune_up). They can
  // be the same object when the target is also the soonest. Both null when the
  // athlete has no upcoming race. ADDITIVE — does not alter week/macro_summary.
  const [target_race, next_race] = await Promise.all([
    getTargetRace(auth.athlete_id),
    getNextRace(auth.athlete_id),
  ]);

  // ADDITIVE provenance fields. `coach_name` (the athlete's coach) and the
  // week's `microciclo_name` (the periodization phase the week belongs to) are
  // surfaced on the iOS "Tu semana" subtitle. `microciclo_name` lives on the
  // week object (it's a property of the published week), `coach_name` at the
  // top level (it's stable across weeks). Both null-safe: an athlete with no
  // coach / a week outside any microcycle simply omits the value.
  return jsonOk({ week, macro_summary: summary, coach_name, target_race, next_race });
}

// The athlete's coach display name (athletes.coach_id -> coaches.full_name).
// NULL when the athlete has no coach assigned (degrades to iOS fallback copy).
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
