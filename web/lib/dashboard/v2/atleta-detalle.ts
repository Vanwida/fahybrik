import 'server-only';

// v2 · FICHA DEL ATLETA — cargadores con BD. La ficha carga por partes:
//   loadFichaShell    — cabecera, estado, «Hacer ahora» (todas las pestañas). Se
//                       apoya en el VISTAZO (`loadAthletePeek`) para que el
//                       estado, el readiness y la adherencia sean los mismos
//                       números que el roster y Hoy.
//   loadFichaEstado   — la columna «Estado» de Plan.
//   loadFichaPerfil   — la pestaña Perfil.
//   (el calendario vive en ./ficha-calendar.ts; Rendimiento carga cada sección
//    por su cuenta, a la vista.)
// Cada pieza degrada por separado: un fallo se devuelve como error de ESA pieza,
// nunca como «sin datos».

import { effectiveLevelAxisLabel } from '@fahybrid/shared/domain/coach/level-axis';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { loadAthletePeek } from '@/lib/coach/athlete-peek';
import { loadAthleteLifecycleDetail } from '@/lib/dashboard/coach/athlete-lifecycle-detail';
import { getTargetRace } from '@/lib/races/next-race';
import { listLevelOptions } from '@/lib/coach/level-options';
import { computeLevelSuggestion } from '@/lib/coach/level-proposal';
import { levelSuggestionGapLine } from '@/lib/dashboard/v2/level-gap';
import { listAthleteWeeks } from '@/lib/coach/week-publishing';
import { loadAthleteKeyMarkers } from '@/lib/coach/key-markers';
import { getAthleteBilling, listAthleteInvoices } from '@/lib/coach/billing';
import { getAthleteReviewState } from '@/lib/citas/reviews';
import { listSessionReportsForAthlete } from '@/lib/coach/session-reports';
import { decodeCoachAssignmentNotes } from '@/lib/dashboard/coach/day-sessions';
import { BOX_TIMEZONE, addDays, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/dates';
import {
  INJURY_SEVERITY_LABEL,
  INJURY_ZONE_LABEL,
  type InjurySeverity,
  type InjuryZone,
} from '@fahybrid/shared/domain/coach/injury-taxonomy';
import { SEQUENCE_DAYS_MAX, SEQUENCE_DAYS_MIN } from '@fahybrid/shared/schema/program-sequences';
import {
  WEEKDAY_KEYS,
  deriveTrainingDaysPerWeek,
  parseAvailability,
} from '@fahybrid/shared/domain/coach/intake-availability';
import { DAY_LABELS, DAY_LABELS_FULL } from '@/lib/dashboard/constants/calendar';
import { INTAKE_PLAN_MODE_DEFAULT } from '@fahybrid/shared/schema/coach-intake';
import type {
  ClasificacionData,
  DetalleLifecycle,
  FichaEstado,
  FichaPerfil,
  FichaShell,
  TrainingDaysData,
} from './atleta-detalle-types';
import { divisionLabel, raceCategoryLabel } from './ficha-format';
import { loadFichaTimeline } from './ficha-timeline';
import { getCurrentMicrociclo } from '@fahybrid/shared/domain/coach/current-microciclo';
import { canRevertToSequence } from '@/lib/dashboard/coach/revert-personal-plan';

export { resolveAtletaUrl, canonicalFichaQuery } from './atleta-detalle-types';

const ACTIVE_LIFECYCLE: DetalleLifecycle = {
  status: 'activo',
  pause_reason: null,
  paused_since: null,
  planned_return: null,
  paused_by_name: null,
  paused_by_kind: null,
  baja_at: null,
  baja_reason: null,
  baja_by_name: null,
  pending_request: null,
  baja_scheduled_for: null,
  baja_scheduled_in_days: null,
  pause_days_available: null,
};

// ── Cabecera + estado ────────────────────────────────────────────────────────

interface ShellExtras {
  email: string | null;
  modality: string | null;
  has_upcoming: boolean;
  pending_comms: number;
  missed_id: string | null;
  missed_date: string | null;
  missed_title: string | null;
  missed_notes: string | null;
  checkin_answered: boolean;
}

async function loadShellExtras(client: Sql, coach_id: number, athlete_id: number, today: string) {
  const rows = await client<ShellExtras[]>`
    select
      u.email,
      sub.plan_type as modality,
      exists (
        select 1 from workout_assignments wa
        where wa.athlete_id = a.id and wa.origin = 'coach' and wa.scheduled_for >= ${today}::date
      ) as has_upcoming,
      (
        select count(*)::int
        from coach_communication_recipients r
        join coach_communications c on c.id = r.communication_id
        where r.athlete_id = a.id and c.coach_id = a.coach_id and c.status = 'published'
          and r.done_at is null and r.answered_at is null
      ) as pending_comms,
      ms.id as missed_id, ms.date as missed_date, ms.title as missed_title, ms.notes as missed_notes,
      coalesce(ck.answered, false) as checkin_answered
    from athletes a
    left join users u on u.id = a.user_id
    -- La debida sin hacer más reciente (14 días), con la misma regla que la
    -- adherencia: semana visible, sin pausa ni reposo por lesión, sin ejecución.
    left join lateral (
      select wa.id::text as id, to_char(wa.scheduled_for, 'YYYY-MM-DD') as date, t.name as title, wa.notes
      from workout_assignments wa
      join templates t on t.id = wa.template_id
      left join weekly_plans wp on wp.athlete_id = wa.athlete_id
        and wp.week_start = date_trunc('week', wa.scheduled_for)::date
      where wa.athlete_id = a.id and wa.origin = 'coach'
        and wa.scheduled_for < ${today}::date and wa.scheduled_for >= ${today}::date - 14
        and wa.status not in ('completed', 'partial')
        and coalesce(wa.injury_adaptation, '') <> 'rest'
        and coalesce(wp.status::text, 'published') <> 'draft'
        and not exists (select 1 from workout_executions we where we.assignment_id = wa.id)
        and not exists (
          select 1 from athlete_pauses ap where ap.athlete_id = wa.athlete_id
            and wa.scheduled_for >= ap.start_date and wa.scheduled_for <= coalesce(ap.end_date, wa.scheduled_for)
        )
      order by wa.scheduled_for desc, wa.id desc
      limit 1
    ) ms on true
    left join lateral (
      select exists (
        select 1 from chat_threads th
        join chat_messages m on m.thread_id = th.id and m.deleted_at is null
        where th.athlete_id = a.id and m.sender_role::text = 'coach' and m.created_at > dc.recorded_at
      ) as answered
      from daily_checkins dc where dc.athlete_id = a.id
      order by dc.recorded_for desc limit 1
    ) ck on true
    left join lateral (
      select s.plan_type from subscriptions s
      where s.user_id = a.user_id
      order by (s.status = 'active') desc, s.created_at desc
      limit 1
    ) sub on true
    where a.id = ${athlete_id} and a.coach_id = ${coach_id}
  `;
  return rows[0] ?? null;
}

/** Cabecera, estado y lo que decide «Hacer ahora». null si el atleta no es del coach. */
export async function loadFichaShell(params: {
  coach_id: number | bigint;
  athlete_id: number;
  club_name: string;
  client?: Sql;
}): Promise<FichaShell | null> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  const peek = await loadAthletePeek({ coach_id: coachId, athlete_id: params.athlete_id, client });
  if (!peek) return null;
  const today = peek.week.today;
  const thisMonday = peek.week.week_start;
  const lastMonday = isoDateString(addDays(parseIsoDate(thisMonday), 14));

  const [extras, lifecycle, target, weeks, micro] = await Promise.all([
    loadShellExtras(client, coachId, params.athlete_id, today),
    loadAthleteLifecycleDetail({ athlete_id: params.athlete_id, client }).catch(() => null),
    getTargetRace(params.athlete_id, client).catch(() => null),
    listAthleteWeeks({ coach_id: coachId, athlete_id: params.athlete_id, from: thisMonday, to: lastMonday, client }).catch(
      () => [],
    ),
    getCurrentMicrociclo({ athlete_id: params.athlete_id, client }).catch(() => null),
  ]);
  const isPersonal = micro?.template_athlete_id != null;
  const canRevert = isPersonal
    ? await canRevertToSequence({ athlete_id: params.athlete_id, client }).catch(() => false)
    : false;

  // Una semana RETENIDA la ocultó el coach a propósito: no se le pide publicarla.
  const hidden = weeks.find((w) => !w.visible && !w.held && w.sessions > 0);
  const race =
    peek.race && target && target.race_date === peek.race.date
      ? {
          name: peek.race.name,
          date: peek.race.date,
          days: peek.race.days,
          category_label: raceCategoryLabel(target.format, target.division),
          goal_time_seconds: target.goal_time_seconds,
        }
      : peek.race
        ? { ...peek.race, category_label: null, goal_time_seconds: null }
        : null;

  return {
    athlete_id: peek.athlete_id,
    name: peek.name,
    avatar_url: peek.avatar_url,
    email: extras?.email ?? null,
    level: peek.level,
    division_label: divisionLabel(extras?.modality ?? null),
    race,
    program: peek.program,
    group: peek.group,
    status: peek.status,
    lifecycle: lifecycle ?? ACTIVE_LIFECYCLE,
    unread: peek.unread,
    awaiting_reply: peek.awaiting_reply,
    today,
    readiness: peek.readiness
      ? {
          value: peek.readiness.value,
          baseline: peek.readiness.baseline,
          baseline_readings: peek.readiness.baseline_readings,
          trend_14d: peek.readiness.trend_14d,
          observed_at: peek.readiness.observed_at,
          band: peek.readiness.band,
        }
      : null,
    week_days: peek.week.days,
    adherence: peek.adherence,
    intake_pending: peek.status.key === 'nuevo',
    has_upcoming_plan: extras?.has_upcoming ?? false,
    publish_target: hidden
      ? {
          week_start: hidden.week_start,
          sessions: hidden.sessions,
          due: hidden.opens_on == null || hidden.opens_on <= today,
          opens_on: hidden.opens_on ?? null,
        }
      : null,
    pending_comunicados: extras?.pending_comms ?? 0,
    last_missed:
      extras?.missed_id && extras.missed_date
        ? {
            id: extras.missed_id,
            date: extras.missed_date,
            title: decodeCoachAssignmentNotes(extras.missed_notes).display_title ?? extras.missed_title ?? 'Entreno',
          }
        : null,
    last_checkin: peek.last_checkin
      ? {
          on: peek.last_checkin.on,
          notes: peek.last_checkin.notes,
          score: peek.last_checkin.score,
          answered: extras?.checkin_answered ?? false,
        }
      : null,
    personal_plan: micro
      ? { current_name: micro.name, is_personal: isPersonal, can_revert: canRevert }
      : null,
    club_name: params.club_name,
  };
}

// ── Columna «Estado» ─────────────────────────────────────────────────────────

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Noches mínimas para que exista una base de sueño (como el readiness). */
const SLEEP_BASELINE_MIN_NIGHTS = 7;

export async function loadFichaEstado(params: {
  coach_id: number | bigint;
  athlete_id: number;
  readiness: FichaEstado['readiness'];
  client?: Sql;
}): Promise<FichaEstado> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  const ath = params.athlete_id;

  const [sleepRows, checkin, injury, note, markers] = await Promise.all([
    client<Array<{ on: string; hours: number; recent: boolean }>>`
      with a as (
        select id, (now() at time zone coalesce(timezone, ${BOX_TIMEZONE}))::date as today
        from athletes where id = ${ath} and coach_id = ${coachId}
      )
      select to_char(s.recorded_for, 'YYYY-MM-DD') as on,
             (s.breakdown_json->>'sleep_hours')::float8 as hours,
             s.recorded_for > a.today - 7 as recent
      from athlete_daily_readiness_snapshots s join a on a.id = s.athlete_id
      where s.recorded_for > a.today - 35
        and jsonb_typeof(s.breakdown_json->'sleep_hours') = 'number'
    `,
    client<
      Array<{
        on: string;
        at: Date;
        score: number;
        notes: string | null;
        soreness: number | null;
        fatigue: number | null;
        answered: boolean;
      }>
    >`
      select to_char(dc.recorded_for, 'YYYY-MM-DD') as on, dc.recorded_at as at, dc.sub_score::int as score,
             nullif(btrim(dc.notes), '') as notes, dc.soreness::int as soreness, dc.fatigue::int as fatigue,
             exists (
               select 1 from chat_threads t
               join chat_messages m on m.thread_id = t.id and m.deleted_at is null
               where t.athlete_id = dc.athlete_id and m.sender_role::text = 'coach' and m.created_at > dc.recorded_at
             ) as answered
      from daily_checkins dc
      join athletes a on a.id = dc.athlete_id and a.coach_id = ${coachId}
      where dc.athlete_id = ${ath}
      order by dc.recorded_for desc
      limit 1
    `,
    client<Array<{ id: string; zone: InjuryZone; severity: InjurySeverity; status: string; onset: string }>>`
      select i.id::text, i.zone::text as zone, i.severity::text as severity, i.status::text as status,
             to_char(i.onset_date, 'YYYY-MM-DD') as onset
      from injuries i
      join athletes a on a.id = i.athlete_id and a.coach_id = ${coachId}
      where i.athlete_id = ${ath} and i.status in ('activa', 'en_recuperacion')
      order by (i.status = 'activa') desc, i.onset_date desc
      limit 1
    `,
    client<Array<{ body: string; created_at: Date }>>`
      select body, created_at from athlete_coach_notes
      where athlete_id = ${ath} and coach_id = ${coachId} and deleted_at is null
      order by created_at desc
      limit 1
    `,
    loadAthleteKeyMarkers({ coach_id: coachId, athlete_id: ath, client }),
  ]);

  const recent = sleepRows.filter((r) => r.recent).map((r) => r.hours);
  const older = sleepRows.filter((r) => !r.recent).map((r) => r.hours);
  const c = checkin[0];
  const inj = injury[0];

  return {
    readiness: params.readiness,
    sleep:
      recent.length > 0
        ? {
            avg_7d_hours: recent.reduce((a, b) => a + b, 0) / recent.length,
            baseline_hours: older.length >= SLEEP_BASELINE_MIN_NIGHTS ? median(older) : null,
            nights: recent.length,
          }
        : null,
    last_checkin: c
      ? { on: c.on, score: c.score, notes: c.notes, soreness: c.soreness, fatigue: c.fatigue, answered: c.answered }
      : null,
    injury: inj
      ? {
          id: inj.id,
          zone_label: INJURY_ZONE_LABEL[inj.zone] ?? inj.zone,
          severity_label: INJURY_SEVERITY_LABEL[inj.severity] ?? inj.severity,
          status: inj.status,
          onset_date: inj.onset,
        }
      : null,
    note: note[0] ? { body: note[0].body, created_at: note[0].created_at.toISOString() } : null,
    markers,
  };
}

// ── Perfil ───────────────────────────────────────────────────────────────────

/** Nivel + días objetivo + la sugerencia del algoritmo + los niveles del coach. */
export async function loadClassification(params: {
  coach_id: number | bigint;
  athlete_id: number;
  client: Sql;
}): Promise<ClasificacionData> {
  const { coach_id, athlete_id, client } = params;
  const rows = await client<
      Array<{
        level_id: string | null;
        level_name: string | null;
        suggested_level_id: string | null;
        suggested_level_name: string | null;
        training_days_per_week: number | null;
        axis_label: string | null;
      }>
    >`
      select a.level_id::text as level_id, al.name as level_name,
             a.suggested_level_id::text as suggested_level_id, sal.name as suggested_level_name,
             a.training_days_per_week,
             (select c.level_axis_label from coaches c where c.id = a.coach_id) as axis_label
      from athletes a
      left join athlete_levels al  on al.id = a.level_id
      left join athlete_levels sal on sal.id = a.suggested_level_id
      where a.id = ${athlete_id} and a.coach_id = ${coach_id}
      limit 1
    `;
  const row = rows[0];
  const axis = effectiveLevelAxisLabel(row?.axis_label);
  // Los que se pueden elegir, más el que ya lleva aunque esté retirado. Sin
  // nivel puesto, la sugerencia se calcula al leer (sin escribir): la guardada
  // puede ser de una escalera que el coach ya cambió, y si no hay, se dice por qué.
  const [levels, fresh] = await Promise.all([
    listLevelOptions(coach_id, { keep: [row?.level_id], client }),
    row && row.level_id == null ? computeLevelSuggestion(athlete_id, Number(coach_id), client) : Promise.resolve(null),
  ]);
  const suggested = fresh
    ? fresh.status === 'suggested'
      ? { id: fresh.level_id, name: fresh.level_name }
      : null
    : row?.suggested_level_id
      ? { id: row.suggested_level_id, name: row.suggested_level_name ?? '' }
      : null;
  return {
    level_id: row?.level_id ?? null,
    level_name: row?.level_name ?? null,
    suggested_level_id: suggested?.id ?? null,
    suggested_level_name: suggested?.name ?? null,
    suggested_level_reason: null,
    suggestion_gap: fresh ? levelSuggestionGapLine(fresh, axis) : null,
    training_days_per_week: row?.training_days_per_week ?? null,
    levels: levels.map((l) => ({ id: l.id, name: l.name, label: l.label, archived: l.archived })),
    days_band: { min: SEQUENCE_DAYS_MIN, max: SEQUENCE_DAYS_MAX },
    level_axis_label: axis,
  };
}

/**
 * Qué días entrena, según lo que marcó el propio atleta (`availability_json`).
 * El número sale de los días marcados (A2: el rótulo coincide con la rejilla);
 * solo si no marcó ninguno se enseña el objetivo del coach.
 */
async function loadTrainingDays(client: Sql, coach_id: number, athlete_id: number): Promise<TrainingDaysData> {
  const rows = await client<Array<{ availability_json: unknown; training_days_per_week: number | null }>>`
    select availability_json, training_days_per_week from athletes
    where id = ${athlete_id} and coach_id = ${coach_id}
    limit 1
  `;
  const availability = parseAvailability(rows[0]?.availability_json ?? null);
  const declared = deriveTrainingDaysPerWeek(availability);
  return {
    days: WEEKDAY_KEYS.map((key, i) => ({
      key,
      label: DAY_LABELS[i]!,
      full_label: DAY_LABELS_FULL[i]!,
      trains: availability[key] === 'program',
    })),
    // Solo lo marcado: el objetivo del coach vive en Clasificación (A2).
    training_days_per_week: declared ?? null,
    has_availability: declared != null,
  };
}

const EMPTY_DAYS: TrainingDaysData = {
  days: WEEKDAY_KEYS.map((key, i) => ({ key, label: DAY_LABELS[i]!, full_label: DAY_LABELS_FULL[i]!, trains: false })),
  training_days_per_week: null,
  has_availability: false,
};

export async function loadFichaPerfil(params: {
  coach_id: number | bigint;
  athlete_id: number;
  client?: Sql;
}): Promise<FichaPerfil> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  const ath = params.athlete_id;
  const errors: FichaPerfil['errors'] = [];
  const guard = <T>(p: Promise<T>, fallback: T, key: FichaPerfil['errors'][number]) =>
    p.catch(() => {
      errors.push(key);
      return fallback;
    });

  const [base, classification, trainingDays, review, sessions, billing, invoices, timeline, upcoming] = await Promise.all([
    client<Array<{ email: string | null; plan_mode: string; onboarded_at: Date | null }>>`
      select u.email, a.plan_mode, a.onboarded_at
      from athletes a left join users u on u.id = a.user_id
      where a.id = ${ath} and a.coach_id = ${coachId}
    `,
    guard(
      loadClassification({ coach_id: coachId, athlete_id: ath, client }),
      {
        level_id: null,
        level_name: null,
        suggested_level_id: null,
        suggested_level_name: null,
        suggested_level_reason: null,
        training_days_per_week: null,
        levels: [],
        suggestion_gap: null,
        days_band: { min: SEQUENCE_DAYS_MIN, max: SEQUENCE_DAYS_MAX },
        level_axis_label: effectiveLevelAxisLabel(null),
      },
      'clasificacion',
    ),
    guard(loadTrainingDays(client, coachId, ath), EMPTY_DAYS, 'dias'),
    guard(getAthleteReviewState({ athlete_id: ath, coach_id: coachId }), null, 'revisiones'),
    guard(listSessionReportsForAthlete(BigInt(ath)), [], 'revisiones'),
    guard(getAthleteBilling(BigInt(ath), client), null, 'pagos'),
    guard(listAthleteInvoices(BigInt(ath), client), [], 'pagos'),
    guard(loadFichaTimeline({ coach_id: coachId, athlete_id: ath, client }), [], 'historial'),
    client<Array<{ id: string; date: string; title: string | null; notes: string | null }>>`
      select wa.id::text, to_char(wa.scheduled_for, 'YYYY-MM-DD') as date, t.name as title, wa.notes
      from workout_assignments wa
      join athletes a on a.id = wa.athlete_id and a.coach_id = ${coachId}
      join templates t on t.id = wa.template_id
      where wa.athlete_id = ${ath} and wa.origin = 'coach' and wa.status = 'scheduled'
        and wa.scheduled_for >= (now() at time zone coalesce(a.timezone, ${BOX_TIMEZONE}))::date
        and wa.scheduled_for < (now() at time zone coalesce(a.timezone, ${BOX_TIMEZONE}))::date + 28
      order by wa.scheduled_for, wa.id
    `.catch(() => []),
  ]);

  return {
    email: base[0]?.email ?? null,
    plan_mode: base[0]?.plan_mode === 'personal' ? 'personal' : INTAKE_PLAN_MODE_DEFAULT,
    onboarded_at: base[0]?.onboarded_at ? base[0].onboarded_at.toISOString() : null,
    classification,
    training_days: trainingDays,
    review,
    sessions,
    billing,
    invoices,
    timeline,
    upcoming: upcoming.map((u) => ({
      id: u.id,
      date: u.date,
      title: decodeCoachAssignmentNotes(u.notes).display_title ?? u.title ?? 'Entreno',
    })),
    errors: [...new Set(errors)],
  };
}
