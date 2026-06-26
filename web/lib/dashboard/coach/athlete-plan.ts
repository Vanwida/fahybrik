import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, isoDateString, mondayOfWeek, parseIsoDate, startOfDayUtc } from '@fahybrid/shared/domain/dates';
import { getCurrentMicrociclo } from '@fahybrid/shared/domain/coach/current-microciclo';
import { decodeCoachAssignmentNotes } from '@/lib/dashboard/coach/day-sessions';
import { DAY_LABELS } from '@/lib/dashboard/constants/calendar';
import { buildMacroProgress, type MacroProgressPayload } from './macro-progress';

export type PlanViewMode = 'macro' | 'month' | 'week';

export type PlanSessionStatus = 'scheduled' | 'completed' | 'missed' | 'skipped';

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
  weeks: PlanWeekRow[];
  macro: MacroProgressPayload;
  total_sessions: number;
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

async function resolveLatestMonthSpan(params: {
  athlete_id: number;
  client: Sql;
}): Promise<MonthAssignmentSpan | null> {
  const rows = await params.client<
    Array<{ start_date: string; end_date: string }>
  >`
    select
      to_char(start_date, 'YYYY-MM-DD') as start_date,
      to_char(end_date, 'YYYY-MM-DD') as end_date
    from athlete_month_assignments
    where athlete_id = ${params.athlete_id}
    order by start_date desc
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    start: parseIsoDate(row.start_date),
    end: parseIsoDate(row.end_date),
  };
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
    view === 'month' ? await resolveLatestMonthSpan({ athlete_id: params.athlete_id, client }) : null;
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
    weeks,
    macro,
    total_sessions: rows.length,
  };
}
