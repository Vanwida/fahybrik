// The ONE batched per-athlete CTE backing rollupAthleteFacts. Extracted from
// recompute.ts to keep both modules under the 500-line cap. Modelled on
// cohort.ts::loadRealCohort's big CTE, EXTENDED with:
//   - hrv_baseline_days  (distinct HRV days in the 60d window — guards false crashes)
//   - current_microciclo_name + current_microcycle_end_iso (the athlete's active
//     microciclo = the athlete_month_assignments receipt, its name + window end —
//     agnostic, no block/macrocycle entity)
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
  // Structured session feedback (#58): most recent reported body-area discomfort.
  latest_pain_area: string | null;
  latest_pain_at: Date | null;
  latest_pain_note: string | null;
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
  // Revisiones 1:1 recurrentes (#21) — cadencia + última 1:1 + revisión próxima.
  review_cadence: string;
  last_1on1_at: Date | null;
  athlete_since: Date;
  has_upcoming_review: boolean;
  // Comunicados del coach (docs/DECISIONS.md 2026-08-09) — lo que le publicó y
  // este atleta no ha cerrado. `_n` es el total de ese tipo que le reclama; los
  // demás campos citan al que MANDA: la pregunta más antigua, la tarea más
  // atrasada, el protocolo cuyo evento cae antes. Los umbrales no se aplican
  // aquí: eso es del evaluador, que es donde manda el método del coach.
  comm_question_id: string | null;
  comm_question_title: string | null;
  comm_question_oldest_at: Date | null;
  /** ¿Alguna de sus preguntas sin responder bloquea el plan? (del CONJUNTO). */
  comm_question_blocks: boolean | null;
  comm_question_n: number | null;
  comm_task_id: string | null;
  comm_task_title: string | null;
  comm_task_due_iso: string | null;
  comm_task_n: number | null;
  comm_protocol_id: string | null;
  comm_protocol_title: string | null;
  comm_protocol_anchor: string | null;
  comm_protocol_event_iso: string | null;
  comm_protocol_n: number | null;
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
    recent_pain as (
      -- #58: the athlete's most recent finished session that flagged a body-area
      -- discomfort. Scan bound to a recent window (matches the other CTEs' inline
      -- windowing); the discomfortReported evaluator applies the precise
      -- discomfort_recent_days cut on the report time. Newest per athlete wins.
      select distinct on (we.athlete_id)
        we.athlete_id,
        we.pain_area as area,
        we.pain_note as note,
        coalesce(we.ended_at, we.started_at, we.created_at) as at
      from workout_executions we
      where we.pain_area is not null
        and coalesce(we.ended_at, we.started_at, we.created_at)
              >= ${nowIso}::timestamptz - interval '30 days'
      order by we.athlete_id, coalesce(we.ended_at, we.started_at, we.created_at) desc
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
      -- template name; its end = the assignment window end. Agnostic: no phase
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
      where b.source in ('coach_test', 'athlete_test')
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
    ),
    last_1on1 as (
      -- La última 1:1 con el atleta = el parte de sesión más reciente con sujeto atleta
      -- (#14). Cualquier 1:1 (seguimiento o no) reinicia el reloj de la cadencia (#21).
      select sr.athlete_id, max(sr.occurred_at) as ts
      from session_reports sr
      where sr.athlete_id is not null and sr.deleted_at is null
      group by sr.athlete_id
    ),
    upcoming_review as (
      -- ¿Tiene una revisión próxima reservada? (cita futura pendiente|aceptada, kind=
      -- revision). Si la tiene, la revisión NO está vencida (#21).
      select distinct ap.athlete_id
      from appointments ap
      where ap.athlete_id is not null and ap.kind = 'revision'
        and ap.status in ('pendiente', 'aceptada')
        and ap.requested_start >= ${nowIso}::timestamptz
    ),
    comm_question as (
      -- Preguntas publicadas que este atleta NO ha respondido. Manda la más
      -- antigua; el umbral de días lo aplica el evaluador. Que bloquee es del
      -- CONJUNTO: si alguna deja el plan a medio cerrar, la señal sube de nivel
      -- aunque la que se cite sea otra (el detalle lo dice con esas palabras).
      -- Un comunicado archivado ya no reclama, y uno caducado tampoco.
      select
        r.athlete_id,
        count(*)::int                                                    as n,
        (array_agg(c.id::text order by c.published_at asc, c.id asc))[1] as id,
        (array_agg(c.title   order by c.published_at asc, c.id asc))[1]  as title,
        min(c.published_at)                                              as oldest_at,
        bool_or(c.blocks)                                                as blocks
      from coach_communications c
      join coach_communication_recipients r on r.communication_id = c.id
      where c.coach_id = ${coach_id as number}
        and c.kind = 'question'
        and c.status = 'published'
        and r.answered_at is null
        and (c.expires_at is null or c.expires_at > ${nowIso}::timestamptz)
      group by r.athlete_id
    ),
    comm_task as (
      -- Tareas vencidas sin hacer. Manda la de fecha límite más antigua: es la
      -- que fija el retraso con el que el evaluador decide crítico o vigilar.
      select
        r.athlete_id,
        count(*)::int                                                 as n,
        (array_agg(c.id::text order by c.due_date asc, c.id asc))[1]  as id,
        (array_agg(c.title   order by c.due_date asc, c.id asc))[1]   as title,
        to_char(min(c.due_date), 'YYYY-MM-DD')                        as due_iso
      from coach_communications c
      join coach_communication_recipients r on r.communication_id = c.id
      where c.coach_id = ${coach_id as number}
        and c.kind = 'task'
        and c.status = 'published'
        and c.due_date < ${todayIso}::date
        and r.done_at is null
        and (c.expires_at is null or c.expires_at > ${nowIso}::timestamptz)
      group by r.athlete_id
    ),
    comm_protocol_open as (
      -- Protocolos publicados que el atleta AÚN NO HA ABIERTO y que cuelgan de
      -- un evento con fecha propia (carrera o test). La fecha se resuelve contra
      -- el evento del PROPIO atleta; si anchor_ref nombra uno concreto se exige
      -- ese. Sin fecha resoluble no sale fila: una señal con fecha inventada sería
      -- peor que no tenerla.
      select
        r.athlete_id,
        c.id::text           as id,
        c.title              as title,
        c.anchor_kind        as anchor,
        coalesce(rc.d, ts.d) as event_date
      from coach_communications c
      join coach_communication_recipients r on r.communication_id = c.id
      left join lateral (
        select min(ra.race_date) as d
        from races ra
        where c.anchor_kind = 'race'
          and ra.athlete_id = r.athlete_id
          and ra.race_date >= ${todayIso}::date
          and ra.status in ('planned', 'registered')
          and (
            c.anchor_ref is null
            or (c.anchor_ref ~ '^[0-9]+$' and ra.id = c.anchor_ref::bigint)
          )
      ) rc on true
      left join lateral (
        -- Un test con fecha es una sesión de test ya puesta en su plan: el
        -- catálogo del coach no tiene fecha, la asignación sí.
        select min(wa.scheduled_for) as d
        from workout_assignments wa
        where c.anchor_kind = 'test'
          and wa.athlete_id = r.athlete_id
          and wa.calibration_test_id is not null
          and wa.scheduled_for >= ${todayIso}::date
          and (
            c.anchor_ref is null
            or (c.anchor_ref ~ '^[0-9]+$' and wa.id = c.anchor_ref::bigint)
          )
      ) ts on true
      where c.coach_id = ${coach_id as number}
        and c.kind = 'protocol'
        and c.status = 'published'
        and c.anchor_kind in ('race', 'test')
        and r.seen_at is null
        and (c.expires_at is null or c.expires_at > ${nowIso}::timestamptz)
    ),
    comm_protocol as (
      select distinct on (o.athlete_id)
        o.athlete_id,
        o.id                                            as id,
        o.title                                         as title,
        o.anchor                                        as anchor,
        to_char(o.event_date, 'YYYY-MM-DD')             as event_iso,
        count(*) over (partition by o.athlete_id)::int  as n
      from comm_protocol_open o
      where o.event_date is not null
      order by o.athlete_id, o.event_date asc, o.id asc
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
      rp.area                             as latest_pain_area,
      rp.at                               as latest_pain_at,
      rp.note                             as latest_pain_note,
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
      rl.title                            as latest_libre_title,
      a.review_cadence                    as review_cadence,
      a.created_at                        as athlete_since,
      l1.ts                               as last_1on1_at,
      (ur.athlete_id is not null)         as has_upcoming_review,
      cq.id                               as comm_question_id,
      cq.title                            as comm_question_title,
      cq.oldest_at                        as comm_question_oldest_at,
      cq.blocks                           as comm_question_blocks,
      cq.n                                as comm_question_n,
      ct.id                               as comm_task_id,
      ct.title                            as comm_task_title,
      ct.due_iso                          as comm_task_due_iso,
      ct.n                                as comm_task_n,
      cp.id                               as comm_protocol_id,
      cp.title                            as comm_protocol_title,
      cp.anchor                           as comm_protocol_anchor,
      cp.event_iso                        as comm_protocol_event_iso,
      cp.n                                as comm_protocol_n
    from athletes a
    left join hrv_recent   hr on hr.athlete_id = a.id
    left join hrv_baseline hb on hb.athlete_id = a.id
    left join last_sync    ls on ls.athlete_id = a.id
    left join missed_7d    m7 on m7.athlete_id = a.id
    left join rpe_yest     ry on ry.athlete_id = a.id
    left join recent_pain  rp on rp.athlete_id = a.id
    left join last_checkin lc on lc.athlete_id = a.id
    left join a_events     ae on ae.athlete_id = a.id
    left join unread_msgs  um on um.athlete_id = a.id
    left join current_micro cm on cm.athlete_id = a.id
    left join billing      bl on bl.athlete_id = a.id
    left join recent_test  rt on rt.athlete_id = a.id
    left join last_any_test lat on lat.athlete_id = a.id
    left join recent_race  rr on rr.athlete_id = a.id
    left join recent_libre rl on rl.athlete_id = a.id
    left join last_1on1    l1 on l1.athlete_id = a.id
    left join upcoming_review ur on ur.athlete_id = a.id
    left join comm_question cq on cq.athlete_id = a.id
    left join comm_task     ct on ct.athlete_id = a.id
    left join comm_protocol cp on cp.athlete_id = a.id
    where a.coach_id = ${coach_id as number}
      and (${athleteFilter}::bigint is null or a.id = ${athleteFilter}::bigint)
      -- #13: paused/baja athletes are frozen — a paused athlete is DELIBERATELY
      -- inactive, not at-risk, so they raise no inactivity/missed attention signals.
      and a.lifecycle_status = 'activo'
    order by a.full_name asc
  `;
}
