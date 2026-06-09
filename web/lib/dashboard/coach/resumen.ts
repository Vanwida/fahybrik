import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, isoDateString, mondayOfWeek, startOfDayUtc } from '@fahybrid/shared/domain/atr/dates';
import { buildMacroProgress, type MacroProgressPayload } from './macro-progress';
import { getAthleteProgrammingStatus, type AthleteProgrammingStatus } from './programming-status';
import { getNextRace, getTargetRace, toRaceSummary } from '@/lib/races/next-race';
import type { RaceSummary } from '@fahybrid/shared/schema';

export interface AthleteResumen {
  athlete_id: string;
  full_name: string;
  a_event: { name: string; iso_date: string; days_until: number } | null;
  // RACE anchor: target_race = the goal the plan peaks to; next_race = the
  // soonest race (may be an intermediate tune_up). Both null when no upcoming race.
  target_race: RaceSummary | null;
  next_race: RaceSummary | null;
  macro: MacroProgressPayload;
  programming: AthleteProgrammingStatus;
  readiness_score: number | null;
  compliance_pct_7d: number | null;
  load_label: string | null;
  checkin_sub_score: number | null;
  last_checkin_at: string | null;
}

export class ResumenError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ResumenError';
  }
}

export async function buildAthleteResumen(params: {
  coach_id: number | bigint;
  athlete_id: number;
  client?: Sql;
}): Promise<AthleteResumen> {
  const client = params.client ?? defaultSql;
  const today = startOfDayUtc(new Date());
  const todayIso = isoDateString(today);
  const weekStart = isoDateString(mondayOfWeek(today));
  const weekEnd = isoDateString(addDays(mondayOfWeek(today), 6));

  const header = await client<Array<{ id: string; full_name: string }>>`
    select a.id::text, a.full_name
    from athletes a
    where a.id = ${params.athlete_id} and a.coach_id = ${params.coach_id}
    limit 1
  `;
  if (!header[0]) {
    throw new ResumenError('not_found', 'Atleta no encontrado', 404);
  }

  const aEventRows = await client<Array<{ name: string; iso: string; days: number }>>`
    select e.name, to_char(e.start_date, 'YYYY-MM-DD') as iso,
           (e.start_date - ${todayIso}::date)::int as days
    from athlete_target_events ate
    join events e on e.id = ate.event_id
    where ate.athlete_id = ${params.athlete_id} and ate.priority = 'A'
    order by e.start_date asc limit 1
  `;

  const readinessRows = await client<Array<{ score: number }>>`
    select score from athlete_daily_readiness_snapshots
    where athlete_id = ${params.athlete_id}
    order by recorded_for desc limit 1
  `;

  const checkinRows = await client<Array<{ sub_score: number; recorded_for: string }>>`
    select sub_score, to_char(recorded_for, 'YYYY-MM-DD') as recorded_for
    from daily_checkins
    where athlete_id = ${params.athlete_id}
    order by recorded_for desc
    limit 1
  `;

  const complianceRows = await client<Array<{ scheduled: number; completed: number }>>`
    select
      count(*)::int as scheduled,
      count(*) filter (where status = 'completed')::int as completed
    from workout_assignments
    where athlete_id = ${params.athlete_id}
      and scheduled_for >= ${weekStart}::date
      and scheduled_for <= ${weekEnd}::date
  `;

  const scheduled = complianceRows[0]?.scheduled ?? 0;
  const completed = complianceRows[0]?.completed ?? 0;
  const compliance_pct_7d =
    scheduled > 0 ? Math.round((completed / scheduled) * 100) : null;

  const macro = await buildMacroProgress({ athlete_id: params.athlete_id, client });
  const programming = await getAthleteProgrammingStatus({
    athlete_id: params.athlete_id,
    client,
  });

  const [targetRace, nextRace] = await Promise.all([
    getTargetRace(params.athlete_id, client),
    getNextRace(params.athlete_id, client),
  ]);

  const currentWeek = macro.weeks.find((w) => w.status === 'current');
  const load_label =
    currentWeek?.compliance_pct != null
      ? `Cumplimiento sem ${currentWeek.compliance_pct}%`
      : null;

  return {
    athlete_id: header[0].id,
    full_name: header[0].full_name,
    a_event: aEventRows[0]
      ? { name: aEventRows[0].name, iso_date: aEventRows[0].iso, days_until: aEventRows[0].days }
      : null,
    target_race: targetRace ? toRaceSummary(targetRace) : null,
    next_race: nextRace ? toRaceSummary(nextRace) : null,
    macro,
    programming,
    readiness_score: readinessRows[0]?.score ?? null,
    compliance_pct_7d,
    load_label,
    checkin_sub_score: checkinRows[0]?.sub_score ?? null,
    last_checkin_at: checkinRows[0]?.recorded_for ?? null,
  };
}
