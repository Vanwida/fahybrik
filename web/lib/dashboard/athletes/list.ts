import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, isoDateString, mondayOfWeek, startOfDayInBox, startOfDayUtc } from '@fahybrid/shared/domain/dates';
import {
  loadProgrammingStatusMap,
  type ProgrammingStatus,
} from '@/lib/dashboard/coach/programming-status';
import type { RacePriority } from '@fahybrid/shared/schema';
import { isIntakePending } from '@fahybrid/shared/domain/coach/intake-pending';

export type { ProgrammingStatus };

export type AthleteModality = 'individual' | 'dobles' | 'pro_elite';

/**
 * Compact TARGET-race summary for the list row countdown. The TARGET race is the
 * goal the plan peaks to (next upcoming race with priority='target'); null when
 * the athlete has no upcoming target. Mirrors the getTargetRace logic inline as
 * a lateral subquery so the whole list stays a single round-trip (no N+1).
 */
export interface AthleteTargetRaceSummary {
  name: string;
  priority: RacePriority;
  race_date: string;
  days_until: number;
}

export interface AthleteRow {
  athlete_id: string;
  full_name: string;
  primary_discipline: string | null;
  /** Athlete's assigned level name (e.g. 'N1'–'N5') from athlete_levels, null if not set. */
  level_name: string | null;
  /** sort_order from athlete_levels — used to rank levels; 0 when unset. */
  level_sort: number;
  block_type: 'ACC' | 'TRANS' | 'REAL' | null;
  /** Week-in-block (relative to the current block), matching the athlete Hub. */
  block_week: number | null;
  /** Total microcycles in the current block (the "de N" denominator). */
  block_total: number | null;
  readiness_score: number | null;
  compliance_pct: number | null;
  programming_status: ProgrammingStatus;
  programming_label: string | null;
  alert_label: string | null;
  alert_severity: 'critical' | 'warning' | null;
  week_ok: boolean;
  modality: AthleteModality | null;
  /** True when the athlete's active subscription is coach-granted (free). */
  is_comp: boolean;
  /** Next upcoming TARGET race + countdown, null when none. */
  target_race: AthleteTargetRaceSummary | null;
  /** Athlete finished onboarding but the coach hasn't reviewed intake yet. */
  intake_pending: boolean;
}

export async function fetchAthletesForCoach(params: {
  coach_id: number | bigint;
  modality?: AthleteModality | null;
  client?: Sql;
}): Promise<AthleteRow[]> {
  const client = params.client ?? defaultSql;
  const today = startOfDayUtc(new Date());
  const weekStart = isoDateString(mondayOfWeek(today));
  const weekEnd = isoDateString(addDays(mondayOfWeek(today), 6));
  // Race countdown resolves "today" in the box timezone (Europe/Madrid), matching
  // getNextRace — never UTC, or the countdown shifts a day late in the evening.
  const raceTodayIso = isoDateString(startOfDayInBox(new Date()));

  const modalityFilter = params.modality ?? null;

  const rows = await client<
    Array<{
      athlete_id: string;
      full_name: string;
      primary_discipline: string | null;
      level_name: string | null;
      level_sort: number;
      block_type: string | null;
      block_week: number | null;
      block_total: number | null;
      readiness_score: number | null;
      scheduled: number;
      completed: number;
      modality: string | null;
      sub_source: string | null;
      target_race_name: string | null;
      target_race_priority: RacePriority | null;
      target_race_date: string | null;
      target_race_days_until: number | null;
      onboarded_at: Date | null;
      intake_completed_at: Date | null;
    }>
  >`
    select
      a.id::text as athlete_id,
      a.full_name,
      a.primary_discipline::text as primary_discipline,
      al.name as level_name,
      coalesce(al.sort_order, 0)::int as level_sort,
      a.onboarded_at,
      a.intake_completed_at,
      ab.type::text as block_type,
      -- Semana RELATIVA AL BLOQUE (week-in-block), idéntica al Hub
      -- (AthleteShell.buildPhaseLine → macro-progress): week_number macro del
      -- microciclo actual − first_week del bloque + 1. NO la week_number macro
      -- (que daría "sem 6" cuando el Hub muestra "Semana 1 de 4").
      (ab.week_number - ab.block_first_week + 1) as block_week,
      ab.block_week_count as block_total,
      rds.score as readiness_score,
      coalesce(wa.scheduled, 0)::int as scheduled,
      coalesce(wa.completed, 0)::int as completed,
      sub.plan_type as modality,
      sub.source as sub_source,
      tr.name as target_race_name,
      tr.priority::text as target_race_priority,
      tr.race_date_iso as target_race_date,
      tr.days_until as target_race_days_until
    from athletes a
    left join athlete_levels al on al.id = a.level_id
    left join lateral (
      -- The microcycle that CONTAINS today (its latest one already started),
      -- not the macrocycle's final week — otherwise every athlete with a fully
      -- materialized plan reads as REAL/Tapering regardless of the current date.
      -- block_first_week / block_week_count come from the SAME block (min/count
      -- of its microcycles) so the roster derives week-in-block exactly like the
      -- Hub (shared macro-progress: block_week = week_number − first_week + 1).
      select
        b.type,
        mc.week_number,
        bspan.first_week as block_first_week,
        bspan.week_count as block_week_count
      from atr_macrocycles mac
      join atr_blocks b on b.macrocycle_id = mac.id
      join microcycles mc on mc.block_id = b.id
      join lateral (
        select
          min(mc2.week_number)::int as first_week,
          count(mc2.id)::int        as week_count
        from microcycles mc2
        where mc2.block_id = b.id
      ) bspan on true
      where mac.athlete_id = a.id and mac.status = 'active'
        and mc.start_date <= ${raceTodayIso}::date
      order by mc.start_date desc
      limit 1
    ) ab on true
    left join lateral (
      select score from athlete_daily_readiness_snapshots s
      where s.athlete_id = a.id
      order by s.recorded_for desc
      limit 1
    ) rds on true
    left join lateral (
      select
        count(*)::int as scheduled,
        count(*) filter (where status = 'completed')::int as completed
      from workout_assignments x
      where x.athlete_id = a.id
        and x.scheduled_for >= ${weekStart}::date
        and x.scheduled_for <= ${weekEnd}::date
    ) wa on true
    left join lateral (
      select plan_type, source
      from subscriptions s
      where s.user_id = a.user_id
      -- Prefer the live (active) subscription so modality + comp badge reflect
      -- current access; fall back to the most recent otherwise.
      order by (s.status = 'active') desc, s.created_at desc
      limit 1
    ) sub on true
    left join lateral (
      -- The next upcoming TARGET race (mirrors getTargetRace): earliest
      -- race_date >= today, status planned/registered, priority='target'.
      select
        r.name,
        r.priority,
        to_char(r.race_date, 'YYYY-MM-DD') as race_date_iso,
        (r.race_date - ${raceTodayIso}::date)::int as days_until
      from races r
      where r.athlete_id = a.id
        and r.race_date >= ${raceTodayIso}::date
        and r.status in ('planned', 'registered')
        and r.priority = 'target'
      order by r.race_date asc, r.id asc
      limit 1
    ) tr on true
    where a.coach_id = ${params.coach_id}
      and (${modalityFilter}::text is null or sub.plan_type = ${modalityFilter})
    order by a.full_name asc
  `;

  const ids = rows.map((r) => Number(r.athlete_id));
  const statusMap = await loadProgrammingStatusMap({ athlete_ids: ids, client });

  return rows.map((r) => {
    const prog = statusMap.get(r.athlete_id);
    const programming_status = prog?.status ?? 'ok';
    const programming_label = prog?.label ?? null;
    const compliance_pct =
      r.scheduled > 0 ? Math.round((r.completed / r.scheduled) * 100) : null;

    let alert_label: string | null = null;
    let alert_severity: AthleteRow['alert_severity'] = null;

    if (programming_status !== 'ok') {
      alert_label =
        programming_status === 'no_month'
          ? 'Sin plan activo'
          : programming_status === 'month_2_pending'
            ? 'Mes pendiente'
            : programming_status === 'empty_week'
              ? 'Semana vacía'
              : (prog?.detail ?? programming_label);
      alert_severity =
        programming_status === 'month_2_pending' || programming_status === 'no_month'
          ? 'critical'
          : 'warning';
    } else if (r.readiness_score != null && r.readiness_score < 45) {
      alert_label = 'Fatiga CNS alta';
      alert_severity = 'warning';
    } else if (r.readiness_score != null && r.readiness_score < 55) {
      alert_label = `Readiness ${r.readiness_score}%`;
      alert_severity = 'warning';
    }

    const week_ok = programming_status === 'ok' && !alert_label;

    return {
      athlete_id: r.athlete_id,
      full_name: r.full_name,
      primary_discipline: r.primary_discipline,
      level_name: r.level_name,
      level_sort: r.level_sort,
      block_type: r.block_type as AthleteRow['block_type'],
      block_week: r.block_week,
      block_total: r.block_total,
      readiness_score: r.readiness_score,
      compliance_pct,
      programming_status,
      programming_label,
      alert_label,
      alert_severity,
      week_ok,
      modality: (r.modality as AthleteModality | null) ?? null,
      is_comp: r.sub_source === 'comp',
      intake_pending: isIntakePending({
        onboarded_at: r.onboarded_at,
        intake_completed_at: r.intake_completed_at,
      }),
      target_race:
        r.target_race_name != null &&
        r.target_race_priority != null &&
        r.target_race_date != null &&
        r.target_race_days_until != null
          ? {
              name: r.target_race_name,
              priority: r.target_race_priority,
              race_date: r.target_race_date,
              days_until: r.target_race_days_until,
            }
          : null,
    };
  });
}
