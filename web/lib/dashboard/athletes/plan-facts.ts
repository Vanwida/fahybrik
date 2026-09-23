import 'server-only';

// Hechos de plan y de ciclo de vida de TODOS los atletas de un coach, en UNA
// consulta. Lo comparten el roster (§4.4), Hoy (§4.3) y el estado del atleta
// (§4.1): quién es, en qué nivel, si está en pausa o con el alta pendiente, qué
// programa tiene ahora y si tiene siguiente, el estado de programación (la misma
// clasificación que `classifyProgrammingStatus`) y si ve su semana — la de ahora
// y la que viene — por la misma puerta que el móvil y el MCP
// (`athleteSeesItFromWeeklyStatus`: solo un borrador esconde, sin fila se ve).
//
// Set-based a propósito: sustituye el bucle `for … await` de 1–5 consultas por
// atleta de `loadProgrammingStatusMap` (≈310 consultas en serie a 100 atletas,
// informe B §2.5). Subconsultas correlacionadas dentro de UNA ida y vuelta.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  addDays,
  isoDateString,
  mondayOfWeek,
  parseIsoDate,
  startOfDayInBox,
} from '@fahybrid/shared/domain/dates';
import {
  classifyProgrammingStatus,
  type AthleteProgrammingStatus,
} from '@fahybrid/shared/domain/coach/programming-status';
import {
  athleteSeesItFromWeeklyStatus,
  athleteWeekChip,
  type AthleteWeekChip,
} from '@fahybrid/shared/domain/coach/athlete-week-chip';
import type { AthleteLifecycleStatus, PauseReason } from '@fahybrid/shared/domain/coach/athlete-lifecycle';
import type { PlanState } from '@fahybrid/shared/domain/coach/athlete-state';
import { autoPublishDate, effectiveAutoPublishDays } from '@fahybrid/shared/domain/coach/week-publishing';

export interface CurrentProgram {
  /** El programa (program_month_templates.id). */
  id: string;
  name: string;
  /** Semana en curso dentro del programa, 1-based. */
  week: number;
  weeks: number;
  start: string;
  end: string;
}

export interface AthletePlanFacts {
  athlete_id: string;
  name: string;
  avatar_url: string | null;
  email: string | null;
  timezone: string | null;
  level: { id: string; label: string; title: string | null } | null;
  lifecycle: AthleteLifecycleStatus;
  pause_reason: PauseReason | null;
  /** Terminó el cuestionario y el coach no ha revisado el alta. */
  intake_pending: boolean;
  /** Aún no ha terminado el cuestionario (invitado). */
  not_onboarded: boolean;
  onboarded_at: string | null;
  programming: AthleteProgrammingStatus;
  plan: PlanState;
  /** YYYY-MM-DD del final de su último programa, o null. */
  last_program_end: string | null;
  current_program: CurrentProgram | null;
  /** YYYY-MM-DD del inicio del siguiente programa ya asignado, o null. */
  next_program_start: string | null;
  /** Chip de la semana en curso (Visible · No lo ve · Semana vacía · Bloque terminado · Sin plan). */
  week_chip: AthleteWeekChip;
  /** La semana en curso está RETENIDA por el coach (borrador manual, mig 0217). */
  week_held: boolean;
  /** La semana que viene: tiene entrenos y está oculta al atleta. */
  next_week_hidden: boolean;
  next_week_held: boolean;
  next_week_sessions: number;
  /**
   * Por la regla del coach («visible N días antes»), la semana que viene ya
   * debería verse: una semana que viene oculta, a partir de ese día, es algo
   * que el coach tiene que hacer (Hoy la agrupa; el estado la cuenta).
   */
  next_week_due: boolean;
}

interface Row {
  athlete_id: string;
  name: string;
  avatar_url: string | null;
  email: string | null;
  timezone: string | null;
  level_id: string | null;
  level_name: string | null;
  level_label: string | null;
  lifecycle: AthleteLifecycleStatus;
  pause_reason: PauseReason | null;
  onboarded_at: Date | null;
  intake_completed_at: Date | null;
  n_months: number;
  last_end: string | null;
  pending_month: boolean;
  pending_week: boolean;
  week_sessions: number;
  week_status: string | null;
  week_mode: string | null;
  next_week_sessions: number;
  next_week_status: string | null;
  next_week_mode: string | null;
  upcoming_sessions: number;
  auto_days: string | null;
  cur_template_id: string | null;
  cur_name: string | null;
  cur_start: string | null;
  cur_end: string | null;
  cur_weeks: number | null;
  next_start: string | null;
}

/** «Hoy» del coach (día de caja) y sus lunes, en YYYY-MM-DD. */
export function coachCalendar(now: Date): {
  today: string;
  week_start: string;
  week_end: string;
  next_week_start: string;
  next_week_end: string;
} {
  const today = startOfDayInBox(now);
  const monday = mondayOfWeek(today);
  return {
    today: isoDateString(today),
    week_start: isoDateString(monday),
    week_end: isoDateString(addDays(monday, 6)),
    next_week_start: isoDateString(addDays(monday, 7)),
    next_week_end: isoDateString(addDays(monday, 13)),
  };
}

export async function loadPlanFacts(params: {
  coach_id: bigint | number;
  athlete_ids?: ReadonlyArray<number | bigint | string>;
  now?: Date;
  client?: Sql;
}): Promise<AthletePlanFacts[]> {
  const client = params.client ?? defaultSql;
  const cal = coachCalendar(params.now ?? new Date());
  const ids = params.athlete_ids ? [...new Set(params.athlete_ids.map((x) => Number(x)))] : null;

  const rows = await client<Row[]>`
    select
      a.id::text                                   as athlete_id,
      a.full_name                                  as name,
      a.avatar_url                                 as avatar_url,
      u.email                                      as email,
      a.timezone                                   as timezone,
      al.id::text                                  as level_id,
      al.name                                      as level_name,
      al.label                                     as level_label,
      a.lifecycle_status                           as lifecycle,
      op.reason                                    as pause_reason,
      a.onboarded_at                               as onboarded_at,
      a.intake_completed_at                        as intake_completed_at,
      coalesce(mo.n, 0)::int                       as n_months,
      mo.last_end                                  as last_end,
      exists (
        select 1 from monthly_block_proposals p
        where p.athlete_id = a.id and p.status = 'pending'
      )                                            as pending_month,
      exists (
        select 1 from week_adjustment_proposals p
        where p.athlete_id = a.id and p.status = 'pending' and p.verdict = 'needs_adjustment'
      )                                            as pending_week,
      (
        select count(*) from workout_assignments w
        where w.athlete_id = a.id
          and w.scheduled_for between ${cal.week_start}::date and ${cal.week_end}::date
      )::int                                       as week_sessions,
      wpc.status::text                             as week_status,
      wpc.delivery_mode                            as week_mode,
      (
        select count(*) from workout_assignments w
        where w.athlete_id = a.id
          and w.scheduled_for between ${cal.next_week_start}::date and ${cal.next_week_end}::date
      )::int                                       as next_week_sessions,
      wpn.status::text                             as next_week_status,
      wpn.delivery_mode                            as next_week_mode,
      (
        select count(*) from workout_assignments w
        where w.athlete_id = a.id
          and w.origin = 'coach'
          and w.scheduled_for >= ${cal.week_start}::date
      )::int                                       as upcoming_sessions,
      -- to_jsonb: tolera un entorno sin la columna (mig 0217) → defecto.
      to_jsonb(co) ->> 'auto_publish_days_before'  as auto_days,
      cur.template_id                              as cur_template_id,
      cur.name                                     as cur_name,
      cur.start_iso                                as cur_start,
      cur.end_iso                                  as cur_end,
      cur.weeks                                    as cur_weeks,
      (
        select to_char(min(m.start_date), 'YYYY-MM-DD') from athlete_month_assignments m
        where m.athlete_id = a.id and m.start_date > ${cal.today}::date
      )                                            as next_start
    from athletes a
    left join users u on u.id = a.user_id
    left join coaches co on co.id = a.coach_id
    left join athlete_levels al on al.id = a.level_id
    left join weekly_plans wpc on wpc.athlete_id = a.id and wpc.week_start = ${cal.week_start}::date
    left join weekly_plans wpn on wpn.athlete_id = a.id and wpn.week_start = ${cal.next_week_start}::date
    left join lateral (
      select count(*)::int as n, to_char(max(m.end_date), 'YYYY-MM-DD') as last_end
      from athlete_month_assignments m where m.athlete_id = a.id
    ) mo on true
    left join lateral (
      select
        m.month_template_id::text                  as template_id,
        t.name                                     as name,
        to_char(m.start_date, 'YYYY-MM-DD')        as start_iso,
        to_char(m.end_date, 'YYYY-MM-DD')          as end_iso,
        greatest(
          coalesce(array_length(m.microcycle_ids, 1), 0),
          ceil((m.end_date - m.start_date + 1) / 7.0)::int
        )                                          as weeks
      from athlete_month_assignments m
      join program_month_templates t on t.id = m.month_template_id
      where m.athlete_id = a.id
        and ${cal.today}::date between m.start_date and m.end_date
      order by m.start_date desc
      limit 1
    ) cur on true
    left join lateral (
      -- El motivo de la pausa en curso (misma condición que el roster viejo).
      select ap.reason from athlete_pauses ap
      where ap.athlete_id = a.id
        and (ap.end_date is null or ap.end_date > ${cal.today}::date)
      order by ap.start_date desc
      limit 1
    ) op on true
    where a.coach_id = ${Number(params.coach_id)}
      and (${ids}::bigint[] is null or a.id = any(${ids}::bigint[]))
    order by a.full_name asc
  `;

  return rows.map((r) => toFacts(r, cal));
}

/** Semana 1-based de `today` dentro de un programa que arranca `startIso` (por lunes). */
function weekOf(startIso: string, todayIso: string): number {
  const monday = mondayOfWeek(parseIsoDate(startIso)).getTime();
  const today = parseIsoDate(todayIso).getTime();
  return Math.max(1, Math.floor((today - monday) / (7 * 86_400_000)) + 1);
}

function toFacts(r: Row, cal: ReturnType<typeof coachCalendar>): AthletePlanFacts {
  const programming = {
    athlete_id: r.athlete_id,
    ...classifyProgrammingStatus({
      has_month_plan: r.n_months > 0,
      upcoming_session_count: r.upcoming_sessions,
      has_pending_month_proposal: r.pending_month,
      has_pending_week_proposal: r.pending_week,
      week_session_count: r.week_sessions,
      last_month_end: r.last_end,
      today: cal.today,
    }),
  };
  const plan: PlanState =
    programming.status === 'no_month'
      ? 'sin_programa'
      : programming.status === 'block_ended'
        ? 'terminado'
        : 'con_programa';

  const week_chip = athleteWeekChip({
    has_month_assignment: r.n_months > 0,
    upcoming_session_count: r.upcoming_sessions,
    last_assignment_end: r.last_end,
    session_count_this_week: r.week_sessions,
    athlete_sees_it: athleteSeesItFromWeeklyStatus(r.week_status),
    today: cal.today,
  });

  const current_program: CurrentProgram | null =
    r.cur_template_id && r.cur_name && r.cur_start && r.cur_end
      ? {
          id: r.cur_template_id,
          name: r.cur_name,
          week: Math.min(weekOf(r.cur_start, cal.today), Math.max(1, r.cur_weeks ?? 1)),
          weeks: Math.max(1, r.cur_weeks ?? 1),
          start: r.cur_start,
          end: r.cur_end,
        }
      : null;

  return {
    athlete_id: r.athlete_id,
    name: r.name,
    avatar_url: r.avatar_url,
    email: r.email,
    timezone: r.timezone,
    level: r.level_id
      ? { id: r.level_id, label: r.level_name ?? '', title: r.level_label }
      : null,
    lifecycle: r.lifecycle,
    pause_reason: r.pause_reason,
    intake_pending: r.onboarded_at != null && r.intake_completed_at == null,
    not_onboarded: r.onboarded_at == null,
    onboarded_at: r.onboarded_at ? r.onboarded_at.toISOString() : null,
    programming,
    plan,
    last_program_end: r.last_end,
    current_program,
    next_program_start: r.next_start,
    week_chip,
    week_held: r.week_status === 'draft' && r.week_mode === 'manual',
    next_week_hidden: r.next_week_sessions > 0 && !athleteSeesItFromWeeklyStatus(r.next_week_status),
    next_week_held: r.next_week_status === 'draft' && r.next_week_mode === 'manual',
    next_week_sessions: r.next_week_sessions,
    next_week_due:
      cal.today >=
      autoPublishDate(
        cal.next_week_start,
        effectiveAutoPublishDays(r.auto_days == null ? null : Number(r.auto_days)),
      ),
  };
}
