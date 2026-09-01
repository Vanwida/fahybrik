import 'server-only';

import type { Sql } from '@/lib/db';
import { addDays, isoDateString, mondayOfWeek, startOfDayUtc } from '@fahybrid/shared/domain/dates';
import { adherencePct } from '@fahybrid/shared/domain/adherence';
import { adherenceExclusionSql } from '@/lib/coach/adherence-pause-filter';
import { getPendingProposalForAthlete } from '@/lib/dashboard/coach/week-adjustments';
import { getLatestReadiness } from '@fahybrid/shared/domain/coach/athlete-daily-readiness';
import { getTargetRace } from '@/lib/races/next-race';
import type { FichaResumenExtras } from './atleta-detalle-types';

export const EMPTY_FICHA: FichaResumenExtras = {
  adherence_weeks: [],
  week_adjustment: null,
  private_note: null,
  sleep_hours: null,
  readiness_delta: null,
  race_goal_time_seconds: null,
  race_date: null,
  race_format: null,
  race_division: null,
};

const ADHERENCE_WEEKS = 4;

export async function loadFichaResumenExtras(params: {
  coach_id: number | bigint;
  athlete_id: number;
  client: Sql;
}): Promise<FichaResumenExtras> {
  const { coach_id, athlete_id, client } = params;
  const today = startOfDayUtc(new Date());
  const thisMonday = mondayOfWeek(today);
  const windowStart = addDays(thisMonday, -7 * (ADHERENCE_WEEKS - 1));
  const windowEnd = addDays(thisMonday, 6);
  const startIso = isoDateString(windowStart);
  const endIso = isoDateString(windowEnd);

  const [weekRows, proposal, noteRows, readiness, targetRace] = await Promise.all([
    client<Array<{ week_start: string; scheduled: number; completed: number }>>`
      select
        to_char(date_trunc('week', wa.scheduled_for)::date, 'YYYY-MM-DD') as week_start,
        count(*)::int as scheduled,
        count(*) filter (
          where exists (
            select 1 from workout_executions we where we.assignment_id = wa.id
          )
        )::int as completed
      from workout_assignments wa
      where wa.athlete_id = ${athlete_id}
        and wa.scheduled_for >= ${startIso}::date
        and wa.scheduled_for <= ${endIso}::date
        ${adherenceExclusionSql(client, client`wa.athlete_id`, client`wa.scheduled_for`, client`wa.injury_adaptation`)}
      group by 1
      order by 1
    `.catch(() => [] as Array<{ week_start: string; scheduled: number; completed: number }>),
    getPendingProposalForAthlete({ coach_id, athlete_id, client }).catch(() => null),
    client<Array<{ body: string }>>`
      select body
      from athlete_coach_notes
      where athlete_id = ${athlete_id}
        and coach_id = ${coach_id as number}
        and deleted_at is null
      order by created_at desc
      limit 1
    `.catch(() => [] as Array<{ body: string }>),
    getLatestReadiness({ athlete_id, client }).catch(() => null),
    getTargetRace(athlete_id, client).catch(() => null),
  ]);

  const byStart = new Map(weekRows.map((r) => [r.week_start, r]));
  const adherence_weeks = Array.from({ length: ADHERENCE_WEEKS }, (_, i) => {
    const start = isoDateString(addDays(windowStart, i * 7));
    const row = byStart.get(start);
    return {
      week_start: start,
      scheduled: row?.scheduled ?? 0,
      completed: row?.completed ?? 0,
      pct: row ? adherencePct(row.scheduled, row.completed) : null,
    };
  });

  const summary =
    proposal?.coach_summary?.trim() ||
    proposal?.proposal.rationale?.trim() ||
    proposal?.proposal.coach_summary?.trim() ||
    null;

  return {
    adherence_weeks,
    week_adjustment:
      proposal && summary
        ? { proposal_id: Number(proposal.id), summary }
        : proposal
          ? { proposal_id: Number(proposal.id), summary: 'Ajuste de semana propuesto.' }
          : null,
    private_note: noteRows[0] ? { body: noteRows[0].body } : null,
    sleep_hours: readiness?.breakdown.sleep_hours ?? null,
    readiness_delta: readiness?.delta_7d ?? null,
    race_goal_time_seconds: targetRace?.goal_time_seconds ?? null,
    race_date: targetRace?.race_date ?? null,
    race_format: targetRace?.format ?? null,
    race_division: targetRace?.division ?? null,
  };
}
