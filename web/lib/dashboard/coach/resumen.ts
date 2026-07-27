import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  BOX_TIMEZONE,
  addDays,
  isoDateString,
  mondayOfWeek,
  parseIsoDate,
  startOfDayUtc,
  zonedDayString,
} from '@fahybrid/shared/domain/dates';
import type {
  CheckinContent,
  CheckinWeekSlot,
} from './checkin-presentation';
import { ADHERENCE_WINDOW_DAYS, adherencePct } from '@fahybrid/shared/domain/adherence';
import { getOrderAlteredForAthlete } from '@/lib/dashboard/v2/order-altered';
import { buildMacroProgress, type MacroProgressPayload } from './macro-progress';
import { getAthleteProgrammingStatus, type AthleteProgrammingStatus } from './programming-status';
import { getNextRace, getTargetRace, toRaceSummary } from '@/lib/races/next-race';
import type { RaceSummary } from '@fahybrid/shared/schema';
import { getLatestReadiness } from '@fahybrid/shared/domain/coach/athlete-daily-readiness';
import { adherenceExclusionSql } from '@/lib/coach/adherence-pause-filter';

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
  /** SOFT, derived INFO signal: the athlete completed THIS week's sessions OUT of
   *  their planned order (true = "cumplió pero cambió el orden / los días"). Carries
   *  NO adherence penalty — purely informational. Single-sourced via
   *  @/lib/dashboard/v2/order-altered (isOrderAltered). False when <2 completions. */
  order_altered: boolean;
  /** Sesiones programadas de la semana en curso (lun-dom) — denominador del read. */
  week_scheduled: number;
  /** Sesiones completadas de la semana en curso — numerador "{done}/{total}". */
  week_completed: number;
  load_label: string | null;
  /** «Cómo se encuentra» — the latest check-in, display-anchored in the ATHLETE's
   *  timezone (days_ago 0 = their today). Null when they've never checked in. */
  checkin: CheckinContent | null;
  /** Trailing 7 athlete-local days (ascending, today last); days without a
   *  check-in ship sub_score null — honest gaps, never zeros. */
  checkin_week: CheckinWeekSlot[];
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

  const header = await client<Array<{ id: string; full_name: string; timezone: string | null }>>`
    select a.id::text, a.full_name, a.timezone
    from athletes a
    where a.id = ${params.athlete_id} and a.coach_id = ${params.coach_id}
    limit 1
  `;
  if (!header[0]) {
    throw new ResumenError('not_found', 'Atleta no encontrado', 404);
  }

  // Readiness via the shared motor (compute-on-miss + recorded_for <= today) so
  // the resumen shows the SAME live score the athlete's own surface computes,
  // never a raw '—' where one exists.
  const readiness = await getLatestReadiness({ athlete_id: params.athlete_id, client });

  // «Cómo se encuentra»: latest full check-in + the trailing-7-local-days strip.
  // Day math runs in the ATHLETE's timezone (fallback: box tz) — the same trap
  // that once made the chat list decide "same day" in the server's zone.
  const athleteTz = header[0].timezone ?? BOX_TIMEZONE;
  const localTodayIso = zonedDayString(new Date(), athleteTz);
  const weekFromIso = isoDateString(addDays(parseIsoDate(localTodayIso), -6));

  const checkinRows = await client<
    Array<{
      recorded_for: string;
      time_label: string;
      soreness: number | null;
      mood: number | null;
      motivation: number | null;
      fatigue: number | null;
      sleep_quality: number | null;
      notes: string | null;
      sub_score: number;
      adaptive_flag: string | null;
    }>
  >`
    select
      to_char(recorded_for, 'YYYY-MM-DD') as recorded_for,
      to_char(recorded_at at time zone ${athleteTz}, 'HH24:MI') as time_label,
      soreness::int, mood::int, motivation::int, fatigue::int, sleep_quality::int,
      notes, sub_score::int, adaptive_flag
    from daily_checkins
    where athlete_id = ${params.athlete_id}
    order by recorded_for desc
    limit 1
  `;
  const latestCheckin = checkinRows[0] ?? null;

  const weekRows = await client<Array<{ recorded_for: string; sub_score: number }>>`
    select to_char(recorded_for, 'YYYY-MM-DD') as recorded_for, sub_score::int
    from daily_checkins
    where athlete_id = ${params.athlete_id}
      and recorded_for >= ${weekFromIso}::date
      and recorded_for <= ${localTodayIso}::date
  `;
  const weekByIso = new Map(weekRows.map((r) => [r.recorded_for, r.sub_score]));
  const checkin_week: CheckinWeekSlot[] = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(parseIsoDate(weekFromIso), i);
    const iso = isoDateString(day);
    // parseIsoDate yields a UTC-midnight Date, so getUTCDay is the calendar
    // weekday of that ISO date; remap JS 0=Sunday to ISO 1=lunes…7=domingo.
    const dow = day.getUTCDay() === 0 ? 7 : day.getUTCDay();
    return { iso, dow, sub_score: weekByIso.get(iso) ?? null };
  });

  const daysAgo = latestCheckin
    ? Math.round(
        (parseIsoDate(localTodayIso).getTime() - parseIsoDate(latestCheckin.recorded_for).getTime()) /
          86_400_000,
      )
    : 0;

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
          and exists (
            select 1 from workout_executions we where we.assignment_id = workout_assignments.id
          )
      )::int as week_completed,
      count(*) filter (
        where scheduled_for >= ${adhStart}::date and scheduled_for <= ${todayIso}::date
      )::int as adh_scheduled,
      count(*) filter (
        where scheduled_for >= ${adhStart}::date and scheduled_for <= ${todayIso}::date
          and exists (
            select 1 from workout_executions we where we.assignment_id = workout_assignments.id
          )
      )::int as adh_completed
    from workout_assignments
    where athlete_id = ${params.athlete_id}
      and scheduled_for >= ${adhStart}::date
      and scheduled_for <= ${weekEnd}::date
      -- #13: EXCLUDE days inside a pause (frozen) from the row source so BOTH windows
      -- (week + rolling adherence) shrink numerator + denominator together — must
      -- AGREE with the roster (list.ts). A fully-paused window ⇒ adh_scheduled 0 ⇒
      -- adherencePct null ("—"), never a punitive 0%.
      ${adherenceExclusionSql(client, client`workout_assignments.athlete_id`, client`workout_assignments.scheduled_for`, client`workout_assignments.injury_adaptation`)}
  `;

  const scheduled = complianceRows[0]?.week_scheduled ?? 0;
  const completed = complianceRows[0]?.week_completed ?? 0;

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

  // Adherencia is undefined without an ACTIVE microciclo. Gate on the SAME signal
  // the roster uses (list.ts `ab` lateral / block_type != null): a dated
  // athlete_month_assignments window CONTAINING today. The macro's "current" week
  // can come from a different source (phase_assignments) and diverge from the
  // roster for an ended/orphaned plan — so we read the assignment receipt directly
  // to keep ficha and roster identical: no active window ⇒ "—", never a stale/seed %.
  const activeMicrociclo = await client<Array<{ one: number }>>`
    select 1 as one from athlete_month_assignments ama
    where ama.athlete_id = ${params.athlete_id}
      and ${todayIso}::date between ama.start_date and ama.end_date
    limit 1
  `;
  const hasActivePlan = activeMicrociclo.length > 0;
  const adherence_pct_30d = hasActivePlan
    ? adherencePct(
        complianceRows[0]?.adh_scheduled ?? 0,
        complianceRows[0]?.adh_completed ?? 0,
      )
    : null;

  // Soft, derived info signal — completed this week's sessions out of planned order.
  // Single-sourced with the roster via @/lib/dashboard/v2/order-altered.
  const order_altered = await getOrderAlteredForAthlete(params.athlete_id, client);

  return {
    athlete_id: header[0].id,
    full_name: header[0].full_name,
    // a_event mirrors the target race (unified spine) — same row toRaceSummary uses.
    a_event: targetRace
      ? { name: targetRace.name, iso_date: targetRace.race_date, days_until: targetRace.days_until }
      : null,
    target_race: targetRace ? toRaceSummary(targetRace) : null,
    next_race: nextRace ? toRaceSummary(nextRace) : null,
    macro,
    programming,
    readiness_score: readiness?.score ?? null,
    adherence_pct_30d,
    order_altered,
    week_scheduled: scheduled,
    week_completed: completed,
    load_label,
    checkin: latestCheckin
      ? {
          recorded_for: latestCheckin.recorded_for,
          time_label: latestCheckin.time_label,
          days_ago: daysAgo,
          soreness: latestCheckin.soreness,
          mood: latestCheckin.mood,
          motivation: latestCheckin.motivation,
          fatigue: latestCheckin.fatigue,
          sleep_quality: latestCheckin.sleep_quality,
          notes: latestCheckin.notes,
          sub_score: latestCheckin.sub_score,
          adaptive_flag: latestCheckin.adaptive_flag,
        }
      : null,
    checkin_week,
  };
}
