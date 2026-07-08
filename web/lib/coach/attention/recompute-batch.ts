// The ONE batched per-athlete CTE backing rollupAthleteFacts. Extracted from
// recompute.ts to keep both modules under the 500-line cap. Modelled on
// cohort.ts::loadRealCohort's big CTE, EXTENDED with:
//   - hrv_baseline_days  (distinct HRV days in the 60d window — guards false crashes)
//   - current_microciclo_name + current_microcycle_end_iso (the athlete's active
//     microciclo = the athlete_month_assignments receipt, its name + window end —
//     agnostic, no ATR block/macrocycle)
//   - billing_* (replicates inbox.ts listInboxAlerts billing block in-CTE)

import 'server-only';
import type { Sql } from '@/lib/db';

export interface BatchRow {
  athlete_id: string;
  full_name: string;
  hrv_recent: number | null;
  hrv_baseline: number | null;
  hrv_baseline_days: number | null;
  last_sync_at: Date | null;
  missed_sessions_7d: number;
  rpe_yesterday: number | null;
  last_checkin_at: Date | null;
  unread_message_age_min: number | null;
  a_event_iso: string | null;
  a_event_name: string | null;
  current_microciclo_name: string | null;
  current_microcycle_end_iso: string | null;
  billing_status: string | null;
  billing_cancel_at_period_end: boolean | null;
  billing_days_to_period_end: number | null;
  // Progression / test events (KEYSTONE-fed)
  latest_test_at: Date | null;
  latest_test_slug: string | null;
  latest_test_unit: string | null;
  latest_test_is_pr: boolean | null;
  days_since_last_test: number | null;
  latest_race_completed_at: Date | null;
  latest_race_name: string | null;
  latest_race_id: string | null;
  // Entreno libre (athlete-originated, no prescrito) — most recent self-origin
  // executed session. The detail line is built in JS (assembleFacts), not SQL.
  latest_libre_at: Date | null;
  latest_libre_title: string | null;
}

export async function loadBatch(
  client: Sql,
  coach_id: bigint | number,
  now: Date,
  athlete_id: bigint | number | null,
): Promise<BatchRow[]> {
  const todayIso = now.toISOString().slice(0, 10);
  const nowIso = now.toISOString();
  const athleteFilter = athlete_id != null ? Number(athlete_id) : null;

  return client<BatchRow[]>`
    with hrv_recent as (
      select bs.athlete_id, avg(bs.value_numeric)::float as v
      from biometric_streams bs
      where bs.metric_type = 'hrv'
        and bs.recorded_at >= ${nowIso}::timestamptz - interval '7 days'
      group by bs.athlete_id
    ),
    hrv_baseline as (
      select bs.athlete_id,
             avg(bs.value_numeric)::float as v,
             count(distinct bs.recorded_at::date)::int as days
      from biometric_streams bs
      where bs.metric_type = 'hrv'
        and bs.recorded_at >= ${nowIso}::timestamptz - interval '60 days'
        and bs.recorded_at <  ${nowIso}::timestamptz - interval '14 days'
      group by bs.athlete_id
    ),
    last_sync as (
      select bs.athlete_id, max(bs.recorded_at) as ts
      from biometric_streams bs
      group by bs.athlete_id
    ),
    missed_7d as (
      select wa.athlete_id, count(*)::int as n
      from workout_assignments wa
      where wa.status = 'missed'
        and wa.scheduled_for >= ${todayIso}::date - interval '7 days'
        and wa.scheduled_for <= ${todayIso}::date
      group by wa.athlete_id
    ),
    rpe_yest as (
      select we.athlete_id, max(we.perceived_exertion)::float as v
      from workout_executions we
      where coalesce(we.ended_at, we.started_at, we.created_at)
              >= ${todayIso}::date - interval '1 day'
        and coalesce(we.ended_at, we.started_at, we.created_at)
              <  ${todayIso}::date
      group by we.athlete_id
    ),
    last_checkin as (
      select dc.athlete_id, max(dc.recorded_at) as ts
      from daily_checkins dc
      group by dc.athlete_id
    ),
    a_events as (
      -- Target race per athlete (unified spine, priority='target'). Same predicate
      -- as getTargetRaceRow, batch form (DISTINCT ON joined into the rollup query).
      select distinct on (r.athlete_id)
        r.athlete_id,
        to_char(r.race_date, 'YYYY-MM-DD') as iso,
        r.name as name
      from races r
      where r.priority = 'target'
        and r.race_date >= ${todayIso}::date
        and r.status in ('planned', 'registered')
      order by r.athlete_id, r.race_date asc
    ),
    unread_msgs as (
      select ct.athlete_id,
             extract(epoch from (${nowIso}::timestamptz - min(cm.created_at))) / 60 as age_min
      from chat_threads ct
      join chat_messages cm on cm.thread_id = ct.id
      where cm.read_at is null
        and cm.deleted_at is null
        and cm.sender_user_id <> (select user_id from coaches where id = ct.coach_id)
      group by ct.athlete_id
    ),
    current_micro as (
      -- The athlete's active microciclo = the athlete_month_assignments receipt
      -- whose window contains today (most recent wins). Its label = the month
      -- template name; its end = the assignment window end. Agnostic: no ATR
      -- block, no macrocycle.
      select distinct on (ama.athlete_id)
        ama.athlete_id,
        m.name                             as name,
        to_char(ama.end_date, 'YYYY-MM-DD') as iso
      from athlete_month_assignments ama
      join program_month_templates m on m.id = ama.month_template_id
      where ${todayIso}::date between ama.start_date and ama.end_date
      order by ama.athlete_id, ama.start_date desc
    ),
    billing as (
      select distinct on (a.id)
        a.id as athlete_id,
        s.status::text as status,
        s.cancel_at_period_end as cancel_at_period_end,
        case
          when s.current_period_end is null then null
          else (s.current_period_end::date - ${todayIso}::date)::int
        end as days_to_period_end
      from athletes a
      join subscriptions s
        on s.user_id = a.user_id or s.partner_user_id = a.user_id
      where a.coach_id = ${coach_id as number}
      order by a.id, s.created_at desc
    ),
    recent_test as (
      -- The athlete's most recent POST-onboarding test (a coach/athlete-entered
      -- benchmark row, tagged in notes — onboarding rows are tagged 'onboarding'
      -- and excluded). Drives test_logged.
      select distinct on (b.athlete_id)
        b.athlete_id, b.recorded_at as ts, b.exercise_slug as slug,
        b.unit as unit, b.value::float as value
      from athlete_benchmarks b
      where b.notes in ('coach_test', 'athlete_test')
      order by b.athlete_id, b.recorded_at desc
    ),
    last_any_test as (
      -- Most recent test of ANY kind (incl. onboarding) — drives test_due.
      select b.athlete_id, max(b.recorded_at)::date as last_date
      from athlete_benchmarks b
      group by b.athlete_id
    ),
    recent_race as (
      -- The most recently recorded FINISHED race (a result imported/logged).
      -- Drives race_completed: prompt the coach to review level + next block.
      select distinct on (r.athlete_id)
        r.athlete_id, r.id::text as id, r.name as name, r.created_at as ts
      from races r
      where r.result_time_seconds is not null
      order by r.athlete_id, r.created_at desc
    ),
    recent_libre as (
      -- The most recent EXECUTED self-origin ("entreno libre") session per
      -- athlete. Drives workout_libre: the coach sees the extra work the athlete
      -- did off-plan. Joins the assignment's origin (mig 0090) → its template.
      select distinct on (we.athlete_id)
        we.athlete_id, we.ended_at as ts, t.name as title, t.format::text as format
      from workout_executions we
      join workout_assignments wa on wa.id = we.assignment_id and wa.origin = 'self'
      join templates t on t.id = wa.template_id
      order by we.athlete_id, we.ended_at desc nulls last
    )
    select
      a.id::text                          as athlete_id,
      a.full_name                         as full_name,
      hr.v                                as hrv_recent,
      hb.v                                as hrv_baseline,
      hb.days                             as hrv_baseline_days,
      ls.ts                               as last_sync_at,
      coalesce(m7.n, 0)                   as missed_sessions_7d,
      ry.v                                as rpe_yesterday,
      lc.ts                               as last_checkin_at,
      um.age_min                          as unread_message_age_min,
      ae.iso                              as a_event_iso,
      ae.name                             as a_event_name,
      cm.name                             as current_microciclo_name,
      cm.iso                              as current_microcycle_end_iso,
      bl.status                           as billing_status,
      bl.cancel_at_period_end             as billing_cancel_at_period_end,
      bl.days_to_period_end               as billing_days_to_period_end,
      rt.ts                               as latest_test_at,
      rt.slug                             as latest_test_slug,
      rt.unit                             as latest_test_unit,
      (rt.athlete_id is not null and not exists (
        select 1 from athlete_benchmarks p
        where p.athlete_id = rt.athlete_id
          and p.exercise_slug = rt.slug
          and p.recorded_at < rt.ts
          and (
            (rt.unit = 'seconds' and p.value <= rt.value)
            or (rt.unit <> 'seconds' and p.value >= rt.value)
          )
      ))                                  as latest_test_is_pr,
      case when lat.last_date is null then null
           else (${todayIso}::date - lat.last_date)::int end as days_since_last_test,
      rr.ts                               as latest_race_completed_at,
      rr.name                             as latest_race_name,
      rr.id                               as latest_race_id,
      rl.ts                               as latest_libre_at,
      rl.title                            as latest_libre_title
    from athletes a
    left join hrv_recent   hr on hr.athlete_id = a.id
    left join hrv_baseline hb on hb.athlete_id = a.id
    left join last_sync    ls on ls.athlete_id = a.id
    left join missed_7d    m7 on m7.athlete_id = a.id
    left join rpe_yest     ry on ry.athlete_id = a.id
    left join last_checkin lc on lc.athlete_id = a.id
    left join a_events     ae on ae.athlete_id = a.id
    left join unread_msgs  um on um.athlete_id = a.id
    left join current_micro cm on cm.athlete_id = a.id
    left join billing      bl on bl.athlete_id = a.id
    left join recent_test  rt on rt.athlete_id = a.id
    left join last_any_test lat on lat.athlete_id = a.id
    left join recent_race  rr on rr.athlete_id = a.id
    left join recent_libre rl on rl.athlete_id = a.id
    where a.coach_id = ${coach_id as number}
      and (${athleteFilter}::bigint is null or a.id = ${athleteFilter}::bigint)
      -- #13: paused/baja athletes are frozen — a paused athlete is DELIBERATELY
      -- inactive, not at-risk, so they raise no inactivity/missed attention signals.
      and a.lifecycle_status = 'activo'
    order by a.full_name asc
  `;
}
