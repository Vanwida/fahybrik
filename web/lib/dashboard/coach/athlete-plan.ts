import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, isoDateString, mondayOfWeek, parseIsoDate, startOfDayUtc } from '@fahybrid/shared/domain/dates';
import { getCurrentMicrociclo } from '@fahybrid/shared/domain/coach/current-microciclo';
import {
  loadMicrocicloPublishState,
  type MicrocicloPublishState,
} from '@/lib/coach/publish-microciclo';
import { decodeCoachAssignmentNotes } from '@/lib/dashboard/coach/day-sessions';
import { DAY_LABELS } from '@/lib/dashboard/constants/calendar';
import { buildMacroProgress, type MacroProgressPayload } from './macro-progress';
import { canRevertToSequence } from './revert-personal-plan';

export type PlanViewMode = 'macro' | 'month' | 'week';

// Mirrors the DB `assignment_status` enum. 'partial' = the athlete terminated the
// session early (honest "ya no puedo más" save) — performed, but not to the end.
export type PlanSessionStatus = 'scheduled' | 'completed' | 'partial' | 'missed' | 'skipped';

export interface PlanSession {
  assignment_id: string;
  iso_date: string;
  title: string;
  status: PlanSessionStatus;
  duration_min: number | null;
  format: string | null;
  /** RPE reportado por el atleta (workout_executions) — null si no hay ejecución. */
  rpe: number | null;
}

export interface PlanDay {
  iso_date: string;
  day_of_week: number;
  label: string;
  is_today: boolean;
  sessions: PlanSession[];
}

export interface PlanWeekRow {
  week_start: string;
  week_end: string;
  days: PlanDay[];
}

export interface AthletePlanPayload {
  athlete_id: string;
  athlete_name: string;
  view_mode: PlanViewMode;
  range_start: string;
  range_end: string;
  /** Current microciclo NAME (coach data, agnostic), null when none active. */
  current_block: string | null;
  /** Same microciclo NAME — display label. null when none active. */
  current_block_label: string | null;
  /** True when the CURRENT microciclo is a personal plan (0164) — built for just
   *  this athlete, not the shared level×días periodización. Drives whether the
   *  ficha offers "Personalizar plan" or shows the athlete is already on one. */
  is_personal: boolean;
  /** True when `is_personal` AND the personal plan came from forking the
   *  periodización (a detached athlete_sequence_progress cursor exists to
   *  resume) — drives whether the ficha offers "Volver a la periodización".
   *  Always false when `is_personal` is false, or when the personal plan was
   *  built from scratch (nothing to revert TO — see revert-personal-plan.ts). */
  can_revert_to_sequence: boolean;
  weeks: PlanWeekRow[];
  macro: MacroProgressPayload;
  total_sessions: number;
  /** Publish state of the current-or-next assigned microciclo (draft/partial/
   *  published) + the assignment id the Publicar action targets. null when the
   *  athlete has no upcoming microciclo. */
  microciclo: MicrocicloPublishState | null;
  /** #4 — a plan scheduled to start AFTER today, queued up behind whatever is
   *  showing above (which may itself be `current_block`, still live, or nothing
   *  at all). null when nothing is scheduled ahead. */
  upcoming_plan: { name: string; start_date: string } | null;
}

export class AthletePlanError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'AthletePlanError';
  }
}

type MonthAssignmentSpan = { start: Date; end: Date };

function computeRange(
  view: PlanViewMode,
  anchor: Date,
  monthSpan?: MonthAssignmentSpan | null,
): { start: Date; end: Date } {
  const today = startOfDayUtc(anchor);
  if (view === 'week') {
    const mon = mondayOfWeek(today);
    return { start: mon, end: addDays(mon, 6) };
  }
  if (view === 'month' && monthSpan) {
    return {
      start: mondayOfWeek(monthSpan.start),
      end: startOfDayUtc(monthSpan.end),
    };
  }
  if (view === 'month') {
    const mon = mondayOfWeek(today);
    return { start: mon, end: addDays(mon, 27) };
  }
  const mon = mondayOfWeek(today);
  return { start: addDays(mon, -84), end: addDays(mon, 27) };
}

/**
 * Which assignment governs the ficha's week view. NOT simply "the one with the
 * latest start_date" — since #4 (start date at assign/personalize) a coach can
 * schedule a plan AHEAD while the athlete is still living out a current one, so
 * "latest start_date" would jump the whole page to a plan that hasn't started
 * yet and bury the one actually running today. Priority: the assignment whose
 * window CONTAINS today; else the soonest upcoming one (a scheduled-but-not-
 * yet-active plan — PlanTab's `planNotStarted`/`planStartLabel` already render
 * this honestly once it's the one resolved here); else, defensively, the most
 * recent past one (should not normally happen — every athlete with any history
 * has either a current or an upcoming assignment).
 */
async function resolveRelevantMonthSpan(params: {
  athlete_id: number;
  today_iso: string;
  client: Sql;
}): Promise<MonthAssignmentSpan | null> {
  const rows = await params.client<
    Array<{ start_date: string; end_date: string }>
  >`
    select start_date, end_date
    from (
      select
        to_char(start_date, 'YYYY-MM-DD') as start_date,
        to_char(end_date, 'YYYY-MM-DD') as end_date,
        case
          when start_date <= ${params.today_iso}::date and end_date >= ${params.today_iso}::date then 0
          when start_date > ${params.today_iso}::date then 1
          else 2
        end as priority,
        id
      from athlete_month_assignments
      where athlete_id = ${params.athlete_id}
    ) ranked
    order by
      priority asc,
      case when priority = 1 then start_date end asc,
      case when priority = 2 then start_date end desc,
      id desc
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    start: parseIsoDate(row.start_date),
    end: parseIsoDate(row.end_date),
  };
}

/** The soonest assignment scheduled to start AFTER today (#4) — a plan the coach
 *  has queued up but that isn't live yet. null when there is none. Feeds the
 *  ficha's "programado" notice so a plan scheduled ahead is never silently
 *  invisible while a current one is still showing. */
async function resolveUpcomingPlan(params: {
  athlete_id: number;
  today_iso: string;
  client: Sql;
}): Promise<{ name: string; start_date: string } | null> {
  const rows = await params.client<Array<{ name: string; start_date: string }>>`
    select m.name, to_char(ama.start_date, 'YYYY-MM-DD') as start_date
    from athlete_month_assignments ama
    join program_month_templates m on m.id = ama.month_template_id
    where ama.athlete_id = ${params.athlete_id}
      and ama.start_date > ${params.today_iso}::date
    order by ama.start_date asc, ama.id asc
    limit 1
  `;
  return rows[0] ?? null;
}

function resolvePlanAnchor(base: Date, monthSpan: MonthAssignmentSpan | null): Date {
  if (!monthSpan) return startOfDayUtc(base);
  const today = startOfDayUtc(base);
  if (today >= monthSpan.start && today <= monthSpan.end) return today;
  if (today < monthSpan.start) return monthSpan.start;
  return monthSpan.start;
}

function buildDaysForWeek(weekStart: Date, sessionsByDate: Map<string, PlanSession[]>, todayIso: string): PlanDay[] {
  const days: PlanDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    const iso = isoDateString(d);
    const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    days.push({
      iso_date: iso,
      day_of_week: dow,
      label: DAY_LABELS[i]!,
      is_today: iso === todayIso,
      sessions: sessionsByDate.get(iso) ?? [],
    });
  }
  return days;
}

export async function buildAthletePlan(params: {
  coach_id: number | bigint;
  athlete_id: number;
  view_mode?: PlanViewMode | undefined;
  anchor_iso?: string | undefined;
  client?: Sql | undefined;
}): Promise<AthletePlanPayload> {
  const client = params.client ?? defaultSql;
  const view = params.view_mode ?? 'month';
  const baseAnchor = params.anchor_iso ? parseIsoDate(params.anchor_iso) : new Date();
  const todayIso = isoDateString(startOfDayUtc(new Date()));

  const monthSpan =
    view === 'month'
      ? await resolveRelevantMonthSpan({ athlete_id: params.athlete_id, today_iso: todayIso, client })
      : null;
  const anchor = resolvePlanAnchor(baseAnchor, monthSpan);
  const range = computeRange(view, anchor, monthSpan);

  const header = await client<Array<{ id: string; full_name: string }>>`
    select a.id::text, a.full_name
    from athletes a
    where a.id = ${params.athlete_id} and a.coach_id = ${params.coach_id}
    limit 1
  `;
  if (!header[0]) {
    throw new AthletePlanError('not_found', 'Atleta no encontrado', 404);
  }

  const startIso = isoDateString(range.start);
  const endIso = isoDateString(range.end);

  const rows = await client<
    Array<{
      assignment_id: string;
      iso_date: string;
      title: string | null;
      status: string;
      duration_seconds: number | null;
      format: string | null;
      rpe: number | null;
      notes: string | null;
    }>
  >`
    select
      wa.id::text as assignment_id,
      to_char(wa.scheduled_for, 'YYYY-MM-DD') as iso_date,
      t.name as title,
      wa.status::text as status,
      we.total_duration_seconds as duration_seconds,
      t.format::text as format,
      we.perceived_exertion as rpe,
      wa.notes as notes
    from workout_assignments wa
    left join templates t on t.id = wa.template_id
    left join workout_executions we on we.assignment_id = wa.id
    where wa.athlete_id = ${params.athlete_id}
      and wa.scheduled_for >= ${startIso}::date
      and wa.scheduled_for <= ${endIso}::date
    order by wa.scheduled_for asc, wa.id asc
  `;

  const sessionsByDate = new Map<string, PlanSession[]>();
  for (const r of rows) {
    // El coach puede renombrar la sesión por-asignación (PATCH display_title →
    // `coach_title:` en wa.notes). Ese override gana al nombre de la plantilla.
    const coachTitle = decodeCoachAssignmentNotes(r.notes).display_title;
    const session: PlanSession = {
      assignment_id: r.assignment_id,
      iso_date: r.iso_date,
      title: coachTitle ?? r.title ?? 'Entreno',
      status: r.status as PlanSessionStatus,
      duration_min: r.duration_seconds != null ? Math.round(r.duration_seconds / 60) : null,
      format: r.format,
      rpe: r.rpe,
    };
    const list = sessionsByDate.get(r.iso_date) ?? [];
    list.push(session);
    sessionsByDate.set(r.iso_date, list);
  }

  const weeks: PlanWeekRow[] = [];
  let cursor = mondayOfWeek(range.start);
  const endMonday = mondayOfWeek(range.end);
  while (cursor <= endMonday) {
    weeks.push({
      week_start: isoDateString(cursor),
      week_end: isoDateString(addDays(cursor, 6)),
      days: buildDaysForWeek(cursor, sessionsByDate, todayIso),
    });
    cursor = addDays(cursor, 7);
  }

  const micro = await getCurrentMicrociclo({ athlete_id: params.athlete_id, client });
  const macro = await buildMacroProgress({ athlete_id: params.athlete_id, client });
  const microciclo = await loadMicrocicloPublishState({ athlete_id: params.athlete_id, client });
  const upcoming_plan = await resolveUpcomingPlan({
    athlete_id: params.athlete_id,
    today_iso: todayIso,
    client,
  });

  const isPersonal = micro?.template_athlete_id != null;
  // Only worth the extra query when the athlete IS on a personal plan — the
  // common case (not personal) skips it entirely.
  const canRevert = isPersonal
    ? await canRevertToSequence({ athlete_id: params.athlete_id, client })
    : false;

  // Current microciclo label = the coach's microciclo NAME (agnostic), null when
  // there's no active microciclo.
  const current_block_label: string | null = micro?.name ?? null;

  return {
    athlete_id: header[0].id,
    athlete_name: header[0].full_name,
    view_mode: view,
    range_start: startIso,
    range_end: endIso,
    current_block: micro?.name ?? null,
    current_block_label,
    is_personal: isPersonal,
    can_revert_to_sequence: canRevert,
    weeks,
    macro,
    total_sessions: rows.length,
    microciclo,
    upcoming_plan,
  };
}
