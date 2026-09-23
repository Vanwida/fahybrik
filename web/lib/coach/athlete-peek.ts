import 'server-only';

// El VISTAZO de un atleta (AthletePeek, panel lateral de Hoy y Atletas): lo justo
// para decidir sin abrir la ficha. Un atleta, consultas en paralelo, todas con
// dueño (coach_id). Reutiliza las mismas cargas que el roster y Hoy — mismo
// estado (§4.1), misma adherencia due-only (§4.2), misma base de readiness — para
// que el número del vistazo sea el mismo que el de la fila que lo abrió.
//
//   1. hechos de plan y ciclo de vida          (plan-facts.ts — también la propiedad)
//   2. señales vivas + silenciadas             (signals-read.ts)
//   3. historia de readiness + bandas del coach
//   4. sesiones de la ventana de adherencia    (adherence.ts)
//   5. hilo: por responder / sin leer           (awaiting-reply.ts)
//   6. extras: grupo, carrera, último check-in, último mensaje
//   7. la semana en curso: sesiones por día + su fila de weekly_plans

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import type { AthleteStatus } from '@fahybrid/shared/domain/coach/athlete-state';
import {
  computeAdherence,
  isSessionDone,
  loadAdherenceSessionsBatch,
  type AdherenceAssignmentStatus,
} from '@fahybrid/shared/domain/coach/adherence';
import { readinessBandOf, type ReadinessBand } from '@fahybrid/shared/domain/coach/signal-thresholds';
import {
  athleteSeesWeek,
  autoPublishDate,
  effectiveAutoPublishDays,
  isHeld,
} from '@fahybrid/shared/domain/coach/week-publishing';
import { addDays, isoDateString, mondayOfWeek, parseIsoDate } from '@fahybrid/shared/domain/dates';
import { groupRuleName } from '@fahybrid/shared/domain/coach/level-axis';
import { buildAthleteStatus } from '@/lib/coach/athlete-state';
import { loadAthleteSignals } from '@/lib/coach/attention/signals-read';
import { loadReplyStates } from '@/lib/coach/attention/awaiting-reply';
import { loadReadinessHistory } from '@/lib/coach/attention/readiness-history';
import { latestReading, readinessBaseline, readinessTrend } from '@/lib/coach/attention/readiness-baseline';
import { resolveCoachThresholds } from '@/lib/coach/signal-thresholds';
import { loadPlanFacts } from '@/lib/dashboard/athletes/plan-facts';

/** Ventana de la adherencia del vistazo — la misma que la columna del roster. */
export const PEEK_ADHERENCE_WINDOW_DAYS = 14;

export type PeekDayState = 'done' | 'missed' | 'pending' | 'rest';

export interface PeekDay {
  /** YYYY-MM-DD */
  date: string;
  state: PeekDayState;
  is_today: boolean;
  /** Entrenos del coach ese día (títulos), en orden. */
  sessions: Array<{ title: string; done: boolean }>;
}

export interface AthletePeekData {
  athlete_id: string;
  name: string;
  avatar_url: string | null;
  level: { id: string; label: string } | null;
  group: { id: string; name: string } | null;
  race: { name: string; date: string; days: number } | null;
  program: { id: string; name: string; week: number; weeks: number } | null;
  status: AthleteStatus;
  readiness: {
    value: number;
    baseline: number | null;
    /** 14 días, el más viejo primero; null = sin lectura ese día. */
    trend_14d: (number | null)[];
    /** YYYY-MM-DD de cada punto de `trend_14d`. */
    trend_days: string[];
    observed_at: string;
    band: ReadinessBand;
  } | null;
  week: {
    week_start: string;
    today: string;
    visible: boolean;
    held: boolean;
    /** Si está en borrador automático: el día en que se abre sola. */
    opens_on: string | null;
    days: PeekDay[];
  };
  adherence: { pct: number | null; due: number; done: number; window_days: number } | null;
  last_checkin: { on: string; recorded_at: string; notes: string | null; score: number } | null;
  last_message: { body: string; created_at: string; from: 'athlete' | 'coach' } | null;
  awaiting_reply: boolean;
  unread: number;
}

export interface PeekSession {
  scheduled_for: string;
  title: string;
  status: AdherenceAssignmentStatus;
  executed: boolean;
  excluded: boolean;
}

/**
 * Los 7 puntos de la semana (lun → dom). Puro.
 *   rest    = ningún entreno del coach (o todos en pausa / descanso por lesión);
 *   done    = todos los entrenos del día hechos;
 *   missed  = día pasado con algo sin hacer, en una semana que el atleta veía
 *             (lo que no podía ver no se le cuenta, igual que la adherencia);
 *   pending = hoy o futuro sin terminar, o pasado oculto.
 */
export function buildWeekDots(
  sessions: ReadonlyArray<PeekSession>,
  week_start: string,
  today: string,
  week_visible: boolean,
): PeekDay[] {
  const days: PeekDay[] = [];
  for (let i = 0; i < 7; i += 1) {
    const date = isoDateString(addDays(parseIsoDate(week_start), i));
    const own = sessions.filter((s) => s.scheduled_for === date && !s.excluded);
    const done = own.map((s) => isSessionDone(s));
    let state: PeekDayState;
    if (own.length === 0) state = 'rest';
    else if (done.every(Boolean)) state = 'done';
    else if (date < today && week_visible) state = 'missed';
    else state = 'pending';
    days.push({
      date,
      state,
      is_today: date === today,
      sessions: own.map((s, k) => ({ title: s.title, done: done[k] ?? false })),
    });
  }
  return days;
}

interface ExtrasRow {
  group_id: string | null;
  group_name: string | null;
  group_level: string | null;
  group_days: number | null;
  race_name: string | null;
  race_date: string | null;
  race_days: number | null;
  checkin_on: string | null;
  checkin_at: Date | null;
  checkin_notes: string | null;
  checkin_score: number | null;
  msg_body: string | null;
  msg_at: Date | null;
  msg_role: 'athlete' | 'coach' | null;
  auto_days: number | null;
  axis_label: string | null;
}

async function loadExtras(client: Sql, coach_id: number, athlete_id: number, today: string): Promise<ExtrasRow | null> {
  const rows = await client<ExtrasRow[]>`
    select
      grp.id as group_id, grp.name as group_name, grp.level_name as group_level, grp.days_per_week as group_days,
      tr.name as race_name, tr.date as race_date, tr.days as race_days,
      ck.on as checkin_on, ck.at as checkin_at, ck.notes as checkin_notes, ck.score as checkin_score,
      lm.body as msg_body, lm.at as msg_at, lm.role as msg_role,
      c.auto_publish_days_before as auto_days,
      c.level_axis_label as axis_label
    from athletes a
    join coaches c on c.id = a.coach_id
    left join lateral (
      select ps.id::text as id, to_jsonb(ps) ->> 'name' as name, al.name as level_name, ps.days_per_week
      from athlete_sequence_progress sp
      join program_sequences ps on ps.id = sp.sequence_id
      left join athlete_levels al on al.id = ps.level_id
      where sp.athlete_id = a.id and sp.status = 'active'
      order by sp.started_at desc
      limit 1
    ) grp on true
    left join lateral (
      select r.name, to_char(r.race_date, 'YYYY-MM-DD') as date, (r.race_date - ${today}::date)::int as days
      from races r
      where r.athlete_id = a.id and r.priority = 'target'
        and r.status in ('planned', 'registered') and r.race_date >= ${today}::date
      order by r.race_date, r.id
      limit 1
    ) tr on true
    left join lateral (
      select to_char(dc.recorded_for, 'YYYY-MM-DD') as on, dc.recorded_at as at,
             nullif(btrim(dc.notes), '') as notes, dc.sub_score::int as score
      from daily_checkins dc
      where dc.athlete_id = a.id
      order by dc.recorded_for desc
      limit 1
    ) ck on true
    left join lateral (
      select coalesce(m.body, '') as body, m.created_at as at, m.sender_role::text as role
      from chat_threads t
      join chat_messages m on m.thread_id = t.id and m.deleted_at is null
      where t.athlete_id = a.id
      order by m.created_at desc
      limit 1
    ) lm on true
    where a.id = ${athlete_id} and a.coach_id = ${coach_id}
  `;
  return rows[0] ?? null;
}

async function loadWeek(
  client: Sql,
  athlete_id: number,
  week_start: string,
): Promise<{
  sessions: PeekSession[];
  row: { status: 'draft' | 'published' | 'archived'; delivery_mode: 'scheduled' | 'manual' } | null;
}> {
  const sunday = isoDateString(addDays(parseIsoDate(week_start), 6));
  const [sessions, rows] = await Promise.all([
    client<
      Array<{
        scheduled_for: string;
        title: string;
        status: AdherenceAssignmentStatus;
        executed: boolean;
        excluded: boolean;
      }>
    >`
      select to_char(wa.scheduled_for, 'YYYY-MM-DD') as scheduled_for,
             coalesce(t.name, 'Entreno') as title,
             wa.status::text as status,
             exists (select 1 from workout_executions we where we.assignment_id = wa.id) as executed,
             (
               wa.injury_adaptation = 'rest'
               or exists (
                 select 1 from athlete_pauses ap
                 where ap.athlete_id = wa.athlete_id and wa.scheduled_for >= ap.start_date
                   and wa.scheduled_for <= coalesce(ap.end_date, wa.scheduled_for)
               )
             ) as excluded
      from workout_assignments wa
      left join templates t on t.id = wa.template_id
      where wa.athlete_id = ${athlete_id}
        and wa.origin = 'coach'
        and wa.scheduled_for between ${week_start}::date and ${sunday}::date
      order by wa.scheduled_for, wa.planned_sequence nulls last, wa.id
    `,
    client<Array<{ status: 'draft' | 'published' | 'archived'; delivery_mode: 'scheduled' | 'manual' }>>`
      select status::text as status, delivery_mode::text as delivery_mode
      from weekly_plans
      where athlete_id = ${athlete_id} and week_start = ${week_start}::date
      limit 1
    `,
  ]);
  return { sessions, row: rows[0] ?? null };
}

function groupName(e: ExtrasRow): string {
  if (e.group_name && e.group_name.trim()) return e.group_name.trim();
  return (
    groupRuleName({ axis_label: e.axis_label, level_name: e.group_level, days_per_week: e.group_days }) ?? 'Grupo'
  );
}

/** El vistazo de UN atleta del coach, o null si no es suyo (o no existe). */
export async function loadAthletePeek(params: {
  coach_id: bigint | number;
  athlete_id: number | bigint | string;
  now?: Date;
  client?: Sql;
}): Promise<AthletePeekData | null> {
  const client = params.client ?? defaultSql;
  const now = params.now ?? new Date();
  const coach_id = Number(params.coach_id);
  const athlete_id = Number(params.athlete_id);
  if (!Number.isSafeInteger(athlete_id) || athlete_id <= 0) return null;
  const ids = [athlete_id];

  const [facts, signals, history, bands, adh, awaiting] = await Promise.all([
    loadPlanFacts({ coach_id, athlete_ids: ids, now, client }),
    loadAthleteSignals({ coach_id, athlete_ids: ids, now, client }),
    loadReadinessHistory({ coach_id, athlete_ids: ids, now, client }),
    resolveCoachThresholds(coach_id, client),
    loadAdherenceSessionsBatch({ client, athlete_ids: ids, coach_id, window_days: PEEK_ADHERENCE_WINDOW_DAYS, now }),
    loadReplyStates({ coach_id, athlete_ids: ids, now, client }),
  ]);
  const f = facts[0];
  if (!f) return null;

  const key = String(athlete_id);
  const today = adh.as_of.get(key) ?? isoDateString(now);
  const week_start = isoDateString(mondayOfWeek(parseIsoDate(today)));
  const [extras, week] = await Promise.all([
    loadExtras(client, coach_id, athlete_id, today),
    loadWeek(client, athlete_id, week_start),
  ]);
  if (!extras) return null;

  const h = history.get(key);
  const latest = h ? latestReading(h.series) : null;
  const trendEnd = h?.today ?? today;
  const plan = adh.sessions.get(key) ?? [];
  const a = plan.length > 0 ? computeAdherence(plan, today, PEEK_ADHERENCE_WINDOW_DAYS) : null;
  const aw = awaiting.get(key);
  const visible = athleteSeesWeek(week.row);
  const autoDraft = week.row?.status === 'draft' && week.row.delivery_mode === 'scheduled';

  return {
    athlete_id: key,
    name: f.name,
    avatar_url: f.avatar_url,
    level: f.level ? { id: f.level.id, label: f.level.label } : null,
    group: extras.group_id ? { id: extras.group_id, name: groupName(extras) } : null,
    race:
      extras.race_name && extras.race_date && extras.race_days != null
        ? { name: extras.race_name, date: extras.race_date, days: extras.race_days }
        : null,
    program: f.current_program
      ? {
          id: f.current_program.id,
          name: f.current_program.name,
          week: f.current_program.week,
          weeks: f.current_program.weeks,
        }
      : null,
    status: buildAthleteStatus(f, signals.get(key), now, aw?.open ?? false),
    readiness:
      latest && h
        ? {
            value: latest.score,
            baseline: readinessBaseline(h.series, latest.on).baseline,
            trend_14d: readinessTrend(h.series, trendEnd),
            trend_days: Array.from({ length: 14 }, (_, i) => isoDateString(addDays(parseIsoDate(trendEnd), i - 13))),
            observed_at: latest.on,
            band: readinessBandOf(latest.score, bands),
          }
        : null,
    week: {
      week_start,
      today,
      visible,
      held: isHeld(week.row),
      opens_on: autoDraft ? autoPublishDate(week_start, effectiveAutoPublishDays(extras.auto_days)) : null,
      days: buildWeekDots(week.sessions, week_start, today, visible),
    },
    adherence: a ? { pct: a.pct, due: a.due, done: a.done, window_days: PEEK_ADHERENCE_WINDOW_DAYS } : null,
    last_checkin:
      extras.checkin_on && extras.checkin_at && extras.checkin_score != null
        ? {
            on: extras.checkin_on,
            recorded_at: extras.checkin_at.toISOString(),
            notes: extras.checkin_notes,
            score: extras.checkin_score,
          }
        : null,
    last_message:
      extras.msg_at && extras.msg_role
        ? { body: extras.msg_body ?? '', created_at: extras.msg_at.toISOString(), from: extras.msg_role }
        : null,
    awaiting_reply: aw?.open ?? false,
    unread: aw?.unread ?? 0,
  };
}
