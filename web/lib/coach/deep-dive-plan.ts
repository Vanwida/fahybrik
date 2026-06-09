// Plan sub-tab payload — month / week / day calendar with AM+PM session
// badges, REAL block taper preview and bulk-action selection. Mirrors the
// Resumen tab pattern: server-side build, plug into client component.
//
// Real data is preferred. When the athlete has no scheduled assignments in
// the visible window OR the URL points at a `demo-N` ID, we fall through to
// the canned demo data (deep-dive-plan-demo.ts).

import { z } from 'zod';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { getCurrentBlock } from '@/lib/atr/service';
import { isDemoAthleteId } from './deep-dive-demo';
import { getMarcPlan, getDemoPlanFallback } from './deep-dive-plan-demo';
import type { AtrBlockType } from '@fahybrid/shared/domain/coach/types';
import { AthleteDeepDiveError } from './athlete-deep-dive';

export const PLAN_VIEW_MODES = ['month', 'week', 'day'] as const;
export type PlanViewMode = (typeof PLAN_VIEW_MODES)[number];

export const PLAN_SLOT = ['AM', 'PM'] as const;
export type PlanSlot = (typeof PLAN_SLOT)[number];

export const PLAN_STATUS = ['scheduled', 'completed', 'missed', 'rest', 'in_progress'] as const;
export type PlanStatus = (typeof PLAN_STATUS)[number];

export interface PlanSession {
  session_id: string;
  iso_date: string;
  slot: PlanSlot;
  title: string;
  modality: 'running' | 'strength' | 'hyrox' | 'skill' | 'recovery' | 'test';
  duration_min: number | null;
  status: PlanStatus;
  intensity_label: string | null;        // "Z2 long", "Threshold", "Hyrox sim"
  rpe: number | null;
  is_pr: boolean;
  taper_factor: number;                  // 0.50 / 0.70 / 1.00 (REAL block) — 1.0 elsewhere
}

export interface PlanWeek {
  week_index: number;                    // 1-based macrocycle week (W18, W19…)
  iso_week_label: string;                // "W19" or "—"
  iso_start_date: string;                // monday
  iso_end_date: string;                  // sunday
  block_type: AtrBlockType | null;
  block_position_in_block: number | null; // 1-based week within current block
  is_taper: boolean;                     // REAL block taper week
  taper_factor: number;                  // 1.00 default · 0.70 · 0.50
  taper_label: string | null;            // "REAL w1 · 100%" / "REAL w2 · 70%"
  has_a_event: boolean;                  // true if a-event lands in this week
  a_event_label: string | null;
  days: PlanDay[];
}

export interface PlanDay {
  iso_date: string;
  day_of_week: number;                   // 1=Mon ... 7=Sun
  short_label: string;                   // "L", "Ma", "Mi", "J", "V", "S", "D"
  long_label: string;                    // "Lunes 04 may"
  is_today: boolean;
  is_past: boolean;
  sessions: PlanSession[];
}

export interface PlanPayload {
  generated_at_iso: string;
  is_demo: boolean;
  athlete_id: string;
  athlete_name: string;
  view_mode: PlanViewMode;
  view_label: string;                    // "Mayo 2026" / "Sem W19 · 04-10 may" / "Mié 06 may"
  range_iso_start: string;
  range_iso_end: string;
  total_sessions: number;
  current_block: AtrBlockType | null;
  current_block_label: string | null;    // "REAL · w1 / 2"
  current_macrocycle_total_weeks: number;
  weeks: PlanWeek[];
  a_event: { name: string; iso_date: string; days_until: number } | null;
}

export const PlanQuerySchema = z.object({
  view: z.enum(PLAN_VIEW_MODES).default('month'),
  anchor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type PlanQuery = z.infer<typeof PlanQuerySchema>;

export const RescheduleBodySchema = z.object({
  to_iso_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha destino inválida'),
  to_slot: z.enum(PLAN_SLOT).optional(),
});
export type RescheduleBody = z.infer<typeof RescheduleBodySchema>;

interface BuildPlanParams {
  coach_id: bigint | number;
  athlete_id: string;
  view_mode?: PlanViewMode;
  anchor_iso?: string;                   // YYYY-MM-DD; defaults to today
  now?: Date;
  client?: Sql;
}

export async function buildAthletePlan(params: BuildPlanParams): Promise<PlanPayload> {
  const now = params.now ?? new Date();
  const view = params.view_mode ?? 'month';
  const anchor = params.anchor_iso ? parseIso(params.anchor_iso) : now;

  if (isDemoAthleteId(params.athlete_id)) {
    const demo = getMarcPlan(params.athlete_id, view, anchor);
    if (!demo) {
      throw new AthleteDeepDiveError('not_found', `demo athlete ${params.athlete_id} unknown`);
    }
    return demo;
  }

  const client = params.client ?? defaultSql;
  const numericId = Number(params.athlete_id);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw new AthleteDeepDiveError('not_found', `athlete ${params.athlete_id} not found`);
  }

  const header = await client<Array<{ id: string; full_name: string }>>`
    select a.id::text as id, a.full_name as full_name
    from athletes a
    where a.id = ${numericId} and a.coach_id = ${params.coach_id as number}
    limit 1
  `;
  if (header.length === 0) {
    throw new AthleteDeepDiveError('not_found', `athlete ${params.athlete_id} not found`);
  }

  const block = await getCurrentBlock({ athlete_id: numericId, on_date: now, client });
  const range = computeRange(view, anchor);

  // Pull all assignments + executions inside [range_start, range_end]. Slot
  // is derived from `templates.day_position` (e.g. "REAL w1 d2 PM"); modality
  // from `templates.format` enum.
  const rows = await client<
    Array<{
      assignment_id: string;
      execution_id: string | null;
      iso_date: string;
      template_name: string | null;
      template_format: string | null;
      template_day_position: string | null;
      duration_seconds: number | null;
      status: string;
      rpe: number | null;
    }>
  >`
    select
      wa.id::text                               as assignment_id,
      we.id::text                               as execution_id,
      to_char(wa.scheduled_for, 'YYYY-MM-DD')   as iso_date,
      t.name                                    as template_name,
      t.format::text                            as template_format,
      t.day_position                            as template_day_position,
      we.total_duration_seconds                 as duration_seconds,
      wa.status::text                           as status,
      we.perceived_exertion::float              as rpe
    from workout_assignments wa
    left join templates t on t.id = wa.template_id
    left join workout_executions we on we.assignment_id = wa.id
    where wa.athlete_id = ${numericId}
      and wa.scheduled_for >= ${range.start_iso}::date
      and wa.scheduled_for <= ${range.end_iso}::date
    order by wa.scheduled_for asc, t.day_position asc nulls last
  `;

  if (rows.length === 0) {
    return getDemoPlanFallback(params.athlete_id, header[0].full_name, view, anchor);
  }

  const a_event = await client<Array<{ name: string; iso: string }>>`
    select e.name, to_char(e.start_date, 'YYYY-MM-DD') as iso
    from athlete_target_events ate
    join events e on e.id = ate.event_id
    where ate.athlete_id = ${numericId} and ate.priority = 'A'
    order by e.start_date asc limit 1
  `;
  const a_evt = a_event[0]
    ? {
        name: a_event[0].name,
        iso_date: a_event[0].iso,
        days_until: daysBetween(now, parseIso(a_event[0].iso)),
      }
    : null;

  const sessions: PlanSession[] = rows.map((r) => ({
    session_id: r.assignment_id,
    iso_date: r.iso_date,
    slot: slotFromDayPosition(r.template_day_position),
    title: r.template_name ?? 'Sesión',
    modality: mapModalityFromFormat(r.template_format),
    duration_min: r.duration_seconds != null ? Math.round(r.duration_seconds / 60) : null,
    status: mapStatus(r.status),
    intensity_label: intensityFromFormat(r.template_format),
    rpe: r.rpe ?? null,
    is_pr: false,
    taper_factor: 1,
  }));

  const weeks = buildWeeks(range, sessions, block, a_evt, now);
  const totalSessions = sessions.length;

  return {
    generated_at_iso: now.toISOString(),
    is_demo: false,
    athlete_id: params.athlete_id,
    athlete_name: header[0].full_name,
    view_mode: view,
    view_label: viewLabel(view, anchor),
    range_iso_start: range.start_iso,
    range_iso_end: range.end_iso,
    total_sessions: totalSessions,
    current_block: block?.block_type ?? null,
    current_block_label: block
      ? `${block.block_type} · w${block.week_number} / ${blockLength(block.block_type)}`
      : null,
    current_macrocycle_total_weeks: 12,
    weeks,
    a_event: a_evt,
  };
}

// ---------------------------------------------------------------------------
// Range computation (month / week / day)
// ---------------------------------------------------------------------------

interface DateRange {
  start_iso: string;
  end_iso: string;
}

function computeRange(view: PlanViewMode, anchor: Date): DateRange {
  if (view === 'day') {
    return { start_iso: isoDate(anchor), end_iso: isoDate(anchor) };
  }
  if (view === 'week') {
    const monday = mondayOf(anchor);
    return { start_iso: isoDate(monday), end_iso: isoDate(addDays(monday, 6)) };
  }
  // Month: pad to full weeks (Mon..Sun) so the calendar grid is rectangular.
  const first = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  const last = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0));
  return { start_iso: isoDate(mondayOf(first)), end_iso: isoDate(addDays(mondayOf(last), 6)) };
}

function viewLabel(view: PlanViewMode, anchor: Date): string {
  if (view === 'day') {
    return anchor.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'short' });
  }
  if (view === 'week') {
    const monday = mondayOf(anchor);
    const sunday = addDays(monday, 6);
    return `Sem ${weekLabel(monday)} · ${monday.getUTCDate()}-${sunday.getUTCDate()} ${monthShort(monday)}`;
  }
  return `${monthLong(anchor)} ${anchor.getUTCFullYear()}`;
}

// ---------------------------------------------------------------------------
// Weeks + days assembly
// ---------------------------------------------------------------------------

function buildWeeks(
  range: DateRange,
  sessions: ReadonlyArray<PlanSession>,
  block: Awaited<ReturnType<typeof getCurrentBlock>>,
  a_event: { name: string; iso_date: string; days_until: number } | null,
  now: Date,
): PlanWeek[] {
  const weeks: PlanWeek[] = [];
  const start = parseIso(range.start_iso);
  const end = parseIso(range.end_iso);
  const todayIso = isoDate(now);

  // Map sessions by iso_date for O(1) lookup.
  const byDate = new Map<string, PlanSession[]>();
  for (const s of sessions) {
    const arr = byDate.get(s.iso_date) ?? [];
    arr.push(s);
    byDate.set(s.iso_date, arr);
  }

  let cursor = start;
  let weekIndex = block?.week_number ?? 0;
  let realPositionCursor = block?.block_type === 'REAL' ? block.block_position : 0;

  while (cursor.getTime() <= end.getTime()) {
    const monday = cursor;
    const sunday = addDays(monday, 6);
    const days: PlanDay[] = [];

    for (let i = 0; i < 7; i++) {
      const day = addDays(monday, i);
      const dayIso = isoDate(day);
      const sessionsForDay = (byDate.get(dayIso) ?? []).slice();
      days.push({
        iso_date: dayIso,
        day_of_week: i + 1,
        short_label: ['L', 'Ma', 'Mi', 'J', 'V', 'S', 'D'][i],
        long_label: day.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'short' }),
        is_today: dayIso === todayIso,
        is_past: dayIso < todayIso,
        sessions: sessionsForDay,
      });
    }

    // Taper logic: only the REAL block tapers. Linear: w1=100%, w2=70%, w3=50%.
    const isReal = block?.block_type === 'REAL';
    let taperFactor = 1;
    let taperLabel: string | null = null;
    let blockPosInBlock: number | null = null;
    if (isReal && weekIndex >= (block?.week_number ?? Infinity)) {
      const realWeek = realPositionCursor || 1;
      blockPosInBlock = realWeek;
      taperFactor = realWeek === 1 ? 1 : realWeek === 2 ? 0.7 : 0.5;
      taperLabel = `REAL w${realWeek} · ${Math.round(taperFactor * 100)}%`;
      realPositionCursor = realWeek + 1;
    }

    // Apply taper factor to all sessions in this week.
    for (const d of days) {
      for (const s of d.sessions) {
        s.taper_factor = taperFactor;
      }
    }

    const has_a_event = a_event != null
      && a_event.iso_date >= isoDate(monday)
      && a_event.iso_date <= isoDate(sunday);

    weeks.push({
      week_index: weekIndex || 0,
      iso_week_label: weekLabel(monday),
      iso_start_date: isoDate(monday),
      iso_end_date: isoDate(sunday),
      block_type: block?.block_type ?? null,
      block_position_in_block: blockPosInBlock,
      is_taper: isReal && taperFactor < 1,
      taper_factor: taperFactor,
      taper_label: taperLabel,
      has_a_event,
      a_event_label: has_a_event ? a_event!.name : null,
      days,
    });

    cursor = addDays(monday, 7);
    weekIndex += 1;
  }
  return weeks;
}

// ---------------------------------------------------------------------------
// Reschedule mutation
// ---------------------------------------------------------------------------

export async function rescheduleAssignment(params: {
  coach_id: bigint | number;
  athlete_id: string;
  session_id: string;
  to_iso_date: string;
  to_slot?: PlanSlot;
  client?: Sql;
}): Promise<{ session_id: string; iso_date: string; slot: PlanSlot }> {
  const client = params.client ?? defaultSql;
  const numericAthleteId = Number(params.athlete_id);
  if (!Number.isFinite(numericAthleteId) || numericAthleteId <= 0) {
    throw new AthleteDeepDiveError('not_found', `athlete ${params.athlete_id} not found`);
  }
  const numericSessionId = Number(params.session_id);
  if (!Number.isFinite(numericSessionId) || numericSessionId <= 0) {
    throw new AthleteDeepDiveError('not_found', `session ${params.session_id} not found`);
  }

  const owns = await client<Array<{ n: number }>>`
    select count(*)::int as n from athletes
    where id = ${numericAthleteId} and coach_id = ${params.coach_id as number}
  `;
  if ((owns[0]?.n ?? 0) === 0) {
    throw new AthleteDeepDiveError('forbidden', 'athlete not assigned to coach');
  }

  // We only persist scheduled_for: the AM/PM slot lives on `templates.day_position`
  // (immutable per template), so a slot change is currently a no-op at the
  // assignment level. Slot is returned as the resolved value (request → template).
  const updated = await client<Array<{ id: string; iso: string; day_position: string | null }>>`
    update workout_assignments wa
    set scheduled_for = ${params.to_iso_date}::date,
        updated_at = now()
    from templates t
    where wa.id = ${numericSessionId}
      and wa.template_id = t.id
      and wa.athlete_id = ${numericAthleteId}
      and wa.status = 'scheduled'
    returning wa.id::text as id,
              to_char(wa.scheduled_for, 'YYYY-MM-DD') as iso,
              t.day_position as day_position
  `;
  if (updated.length === 0) {
    throw new AthleteDeepDiveError('not_found', 'session not found or already locked');
  }
  return {
    session_id: updated[0].id,
    iso_date: updated[0].iso,
    slot: params.to_slot ?? slotFromDayPosition(updated[0].day_position),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapModalityFromFormat(f: string | null): PlanSession['modality'] {
  switch (f) {
    case 'tempo':
    case 'intervals':
      return 'running';
    case 'strength_block':
      return 'strength';
    case 'hyrox_sim':
    case 'amrap':
    case 'for_time':
    case 'circuit':
      return 'hyrox';
    case 'emom':
      return 'skill';
    default:
      return 'running';
  }
}

function intensityFromFormat(f: string | null): string | null {
  switch (f) {
    case 'tempo': return 'Z3 tempo';
    case 'intervals': return 'Z4-Z5 intervals';
    case 'strength_block': return 'Strength';
    case 'hyrox_sim': return 'HYROX sim';
    case 'amrap': return 'AMRAP';
    case 'for_time': return 'For time';
    case 'circuit': return 'Circuit';
    case 'emom': return 'EMOM';
    default: return null;
  }
}

function slotFromDayPosition(dp: string | null): PlanSlot {
  if (!dp) return 'AM';
  return /\bPM\b/i.test(dp) ? 'PM' : 'AM';
}

function mapStatus(s: string): PlanStatus {
  // assignment_status enum: scheduled | completed | missed | skipped
  switch (s) {
    case 'completed': return 'completed';
    case 'missed': return 'missed';
    case 'skipped': return 'rest';
    default: return 'scheduled';
  }
}

function blockLength(t: AtrBlockType | null): number {
  if (t === 'ACC') return 6;
  if (t === 'TRANS') return 4;
  if (t === 'REAL') return 2;
  return 0;
}

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function pad(n: number): string { return String(n).padStart(2, '0'); }
function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}
function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map((s) => Number(s));
  return new Date(Date.UTC(y, m - 1, d));
}
function daysBetween(a: Date, b: Date): number {
  const aDay = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bDay = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((bDay - aDay) / 86_400_000);
}
function mondayOf(d: Date): Date {
  // ISO Monday of the week containing d.
  const day = d.getUTCDay() || 7; // 1..7
  return addDays(d, -(day - 1));
}
function weekLabel(monday: Date): string {
  // ISO week number (approximate — sufficient for display).
  const target = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = (target.getTime() - firstThursday.getTime()) / 86_400_000;
  const week = 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `W${week}`;
}
function monthLong(d: Date): string {
  return d.toLocaleDateString('es-ES', { month: 'long' });
}
function monthShort(d: Date): string {
  return d.toLocaleDateString('es-ES', { month: 'short' });
}
