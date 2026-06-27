import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, isoDateString, mondayOfWeek, startOfDayUtc } from '@fahybrid/shared/domain/dates';
import { ADHERENCE_WINDOW_DAYS, adherencePct } from '@fahybrid/shared/domain/adherence';
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
  /** Rolling completion adherence over the trailing 30 days (market-standard
   *  "adherencia"): completed / scheduled across the window, null when nothing
   *  was due. Single-sourced with the roster via @fahybrid/shared/domain/adherence. */
  adherence_pct_30d: number | null;
  /** Sesiones programadas de la semana en curso (lun-dom) — denominador del read. */
  week_scheduled: number;
  /** Sesiones completadas de la semana en curso — numerador "{done}/{total}". */
  week_completed: number;
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
  // Rolling adherence window: the trailing N days up to and including today
  // (future-scheduled sessions aren't due yet, so they never count as "missed").
  const adhStart = isoDateString(addDays(today, -(ADHERENCE_WINDOW_DAYS - 1)));

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

  // One round-trip covers both windows: the current week (lun-dom) drives the
  // "{done}/{total} esta semana" progress, the trailing 30 days drives adherencia.
  const complianceRows = await client<
    Array<{
      week_scheduled: number;
      week_completed: number;
      adh_scheduled: number;
      adh_completed: number;
    }>
  >`
    select
      count(*) filter (
        where scheduled_for >= ${weekStart}::date and scheduled_for <= ${weekEnd}::date
      )::int as week_scheduled,
      count(*) filter (
        where scheduled_for >= ${weekStart}::date and scheduled_for <= ${weekEnd}::date
          and status = 'completed'
      )::int as week_completed,
      count(*) filter (
        where scheduled_for >= ${adhStart}::date and scheduled_for <= ${todayIso}::date
      )::int as adh_scheduled,
      count(*) filter (
        where scheduled_for >= ${adhStart}::date and scheduled_for <= ${todayIso}::date
          and status = 'completed'
      )::int as adh_completed
    from workout_assignments
    where athlete_id = ${params.athlete_id}
      and scheduled_for >= ${adhStart}::date
      and scheduled_for <= ${weekEnd}::date
  `;

  const scheduled = complianceRows[0]?.week_scheduled ?? 0;
  const completed = complianceRows[0]?.week_completed ?? 0;
  const adherence_pct_30d = adherencePct(
    complianceRows[0]?.adh_scheduled ?? 0,
    complianceRows[0]?.adh_completed ?? 0,
  );

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
    adherence_pct_30d,
    week_scheduled: scheduled,
    week_completed: completed,
    load_label,
    checkin_sub_score: checkinRows[0]?.sub_score ?? null,
    last_checkin_at: checkinRows[0]?.recorded_for ?? null,
  };
}
