// Weekly evaluation cron — pure logic, no auth, no HTTP.
//
// Runs Monday 09:00 UTC. For every athlete with an active month assignment
// (a row in athlete_month_assignments whose [start_date, end_date] window
// covers `now`), we evaluate the week that just finished:
//
//   1. evaluateAthleteWeek(athleteId, lastWeekStart) → verdict.
//   2. verdict !== 'ok' → proposeWeekAdjustment(coachId, athleteId, ...)
//      which persists a `pending` IA proposal for week N+1 and notifies the
//      coach in-app.
//   3. verdict === 'ok' → no action; week N+1 advances unchanged.
//
// Best-effort per athlete: one athlete's failure (DB hiccup, LLM timeout,
// missing context) never aborts the batch. We aggregate counts + per-athlete
// errors so the HTTP layer can surface them to Vercel Cron logs.
//
// `lastWeekStart` = Monday of (today − 7 days). evaluateAthleteWeek already
// defaults to this, but we compute it explicitly so the proposal week_start
// is deterministic and logged.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, isoDateString, mondayOfWeek, startOfDayUtc } from '@fahybrid/shared/domain/atr/dates';
import { evaluateAthleteWeek } from '@/lib/coach/weekly-evaluation';
import { proposeWeekAdjustment } from '@/lib/coach/ai-propose-week-adjustment';

export interface ActiveAthleteRow {
  athlete_id: string;
  coach_id: string;
}

export interface WeeklyEvaluationCronResult {
  evaluated: number;
  proposals_created: number;
  errors: Array<{ athlete_id: string; message: string }>;
}

/**
 * Athletes whose currently-assigned month is in progress (start_date <= now
 * <= end_date). Joined to athletes to resolve the owning coach so we can
 * propose adjustments under the right coach scope.
 */
export async function loadActiveAthletes(params: {
  client: Sql;
  now?: Date;
}): Promise<ActiveAthleteRow[]> {
  const { client } = params;
  const today = isoDateString(startOfDayUtc(params.now ?? new Date()));
  return client<Array<ActiveAthleteRow>>`
    select distinct a.id::text as athlete_id, a.coach_id::text as coach_id
    from athlete_month_assignments ama
    join athletes a on a.id = ama.athlete_id
    where ama.start_date <= ${today}::date
      and ama.end_date >= ${today}::date
      and a.coach_id is not null
    order by a.id asc
  `;
}

export async function runWeeklyEvaluation(params: {
  client?: Sql;
  now?: Date;
}): Promise<WeeklyEvaluationCronResult> {
  const client = params.client ?? defaultSql;
  const today = startOfDayUtc(params.now ?? new Date());
  // The week that just finished: Monday of (today − 7 days).
  const lastWeekStart = isoDateString(mondayOfWeek(addDays(today, -7)));

  const athletes = await loadActiveAthletes({ client, now: params.now });

  const result: WeeklyEvaluationCronResult = {
    evaluated: 0,
    proposals_created: 0,
    errors: [],
  };

  for (const row of athletes) {
    try {
      const evaluation = await evaluateAthleteWeek({
        athlete_id: BigInt(row.athlete_id),
        week_start: lastWeekStart,
        client,
      });
      result.evaluated += 1;

      if (evaluation.verdict !== 'ok') {
        await proposeWeekAdjustment({
          coach_id: BigInt(row.coach_id),
          athlete_id: BigInt(row.athlete_id),
          week_start: lastWeekStart,
          client,
        });
        result.proposals_created += 1;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push({ athlete_id: row.athlete_id, message });
    }
  }

  return result;
}
