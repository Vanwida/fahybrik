import type { Sql } from 'postgres';
import { getCurrentMicrociclo } from './current-microciclo';
import { getTargetRaceRow } from './target-race';
import { addDays, diffDays, isoDateString, mondayOfWeek, parseIsoDate, startOfDayInBox } from '../dates';

export type MacroWeekStatus = 'completed' | 'current' | 'upcoming' | 'missed';

export type MacroProgressWeek = {
  week_start: string;
  week_end: string;
  compliance_pct: number | null;
  adjusted: boolean;
  status: MacroWeekStatus;
  microcycle_id: string | null;
};

export type MacroPhaseAssignment = {
  /** athlete_month_assignments.id — el "microciclo" en lenguaje de coach. */
  microcycle_id: string;
  month_template_id: string;
  name: string;
  level: string;
  start_date: string;
  end_date: string;
};

/**
 * Tramo real de un microciclo asignado (AGNÓSTICO) derivado de
 * `athlete_month_assignments`. `block_type` = NOMBRE del microciclo del coach (no
 * una fase ACC/TRANS/REAL). `week_count` = nº de semanas del microciclo
 * (array_length(microcycle_ids); span por fechas como fallback). `first_week` =
 * índice de semana acumulado (1-based) del primer microciclo del tramo, para
 * mapear la posición dentro del plan completo.
 */
export type MacroBlockSpan = {
  /** Microciclo NAME (coach data) — NOT an ATR phase. */
  block_type: string;
  position: number;
  first_week: number;
  week_count: number;
};

export type MacroProgressPayload = {
  athlete_id: string;
  /** Current microciclo (assignment) id, null when none active. */
  macrocycle_id: string | null;
  /** Current microciclo NAME (coach data), null when none active. */
  block: string | null;
  current_microcycle_index: number;
  /**
   * Semana ACTUAL dentro del microciclo activo (1-indexed). Derivada del receipt
   * `athlete_month_assignments`. null si no hay microciclo activo.
   */
  block_week: number | null;
  /**
   * Tramos reales de los microciclos asignados (week_count por microciclo).
   * Fuente única para el relleno del ribbon — derivado del receipt, no hardcodeado.
   */
  block_spans: MacroBlockSpan[];
  weeks: MacroProgressWeek[];
  total_assigned_weeks: number;
  a_event_days: number | null;
  /** Asignaciones de microciclo (mes-plantilla) ordenadas por start_date asc. */
  phase_assignments: MacroPhaseAssignment[];
};

export async function buildMacroProgress(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client: Sql;
}): Promise<MacroProgressPayload> {
  const client = params.client;
  const today = startOfDayInBox(params.on_date ?? new Date());

  const current = await getCurrentMicrociclo({
    athlete_id: params.athlete_id,
    on_date: today,
    client,
  });

  // Tramos de los microciclos asignados (AGNÓSTICO): nombre + week_count por
  // microciclo desde el receipt `athlete_month_assignments`. `first_week` = índice
  // de semana acumulado (1-based) dentro del plan. Fuente única del ribbon — sin
  // hardcodear semanas/fase.
  const spanRows = await client<Array<{ name: string; week_count: number }>>`
    select
      m.name as name,
      coalesce(array_length(ama.microcycle_ids, 1), 0)::int as week_count
    from athlete_month_assignments ama
    join program_month_templates m on m.id = ama.month_template_id
    where ama.athlete_id = ${params.athlete_id as number}
    order by ama.start_date asc
  `;
  let cumWeek = 1;
  const block_spans: MacroBlockSpan[] = spanRows.map((r, i) => {
    const wc = r.week_count > 0 ? r.week_count : 1;
    const span = { block_type: r.name, position: i, first_week: cumWeek, week_count: wc };
    cumWeek += wc;
    return span;
  });

  // Semana actual dentro del microciclo activo (1-indexed) desde el receipt.
  const block_week = current ? current.week_index : null;

  // Días hasta la carrera objetivo (unified `races` spine, priority='target').
  const targetRace = await getTargetRaceRow(params.athlete_id, client, today);

  const assignmentWeeks = await client<
    Array<{
      week_start: string;
      microcycle_id: string | null;
      scheduled: number;
      completed: number;
      adjusted: boolean;
    }>
  >`
    with week_rows as (
      select
        date_trunc('week', wa.scheduled_for)::date as week_start,
        min(wa.microcycle_id)::text as microcycle_id,
        count(*)::int as scheduled,
        count(*) filter (where wa.status = 'completed')::int as completed
      from workout_assignments wa
      where wa.athlete_id = ${params.athlete_id as number}
      group by 1
    )
    select
      to_char(w.week_start, 'YYYY-MM-DD') as week_start,
      w.microcycle_id,
      w.scheduled,
      w.completed,
      exists (
        select 1 from week_adjustment_proposals p
        where p.athlete_id = ${params.athlete_id as number}
          and p.week_start = w.week_start
          and p.status = 'approved'
          and p.verdict = 'needs_adjustment'
      ) as adjusted
    from week_rows w
    order by w.week_start asc
  `;

  const weeks: MacroProgressWeek[] = assignmentWeeks.map((w) => {
    const ws = parseIsoDate(w.week_start);
    const we = addDays(ws, 6);
    const compliance =
      w.scheduled > 0 ? Math.round((w.completed / w.scheduled) * 100) / 100 : null;
    let status: MacroWeekStatus = 'upcoming';
    if (we < today) status = w.completed >= w.scheduled * 0.5 ? 'completed' : 'missed';
    else if (ws <= today && we >= today) status = 'current';

    return {
      week_start: w.week_start,
      week_end: isoDateString(we),
      compliance_pct: compliance,
      adjusted: w.adjusted,
      status,
      microcycle_id: w.microcycle_id,
    };
  });

  const monthAssignCount = await client<Array<{ n: number }>>`
    select count(*)::int as n from athlete_month_assignments
    where athlete_id = ${params.athlete_id as number}
  `;

  const phaseRows = await client<
    Array<{
      microcycle_id: string;
      month_template_id: string;
      name: string;
      level: string;
      start_date: string;
      end_date: string;
    }>
  >`
    select
      ama.id::text                                    as microcycle_id,
      ama.month_template_id::text                     as month_template_id,
      m.name                                          as name,
      coalesce(al.name, '')                           as level,
      to_char(ama.start_date, 'YYYY-MM-DD')           as start_date,
      to_char(ama.end_date,   'YYYY-MM-DD')           as end_date
    from athlete_month_assignments ama
    join program_month_templates m on m.id = ama.month_template_id
    left join athlete_levels al on al.id = m.level_id
    where ama.athlete_id = ${params.athlete_id as number}
    order by ama.start_date asc
  `;

  const phase_assignments: MacroPhaseAssignment[] = phaseRows.map((r) => ({
    microcycle_id: r.microcycle_id,
    month_template_id: r.month_template_id,
    name: r.name,
    level: r.level,
    start_date: r.start_date,
    end_date: r.end_date,
  }));

  return {
    athlete_id: String(params.athlete_id),
    macrocycle_id: current ? String(current.assignment_id) : null,
    block: current?.name ?? null,
    current_microcycle_index: monthAssignCount[0]?.n ?? 0,
    block_week,
    block_spans,
    weeks,
    total_assigned_weeks: weeks.length,
    a_event_days: targetRace?.days_until ?? null,
    phase_assignments,
  };
}

/* -------------------------------------------------------------------------- */
/* Detalle de microciclo asignado — read-only para el drawer en la ficha.     */
/* -------------------------------------------------------------------------- */

export type MicrocycleWeekDetail = {
  week_index: number;
  week_start: string;
  week_end: string;
  scheduled: number;
  completed: number;
  compliance_pct: number | null;
};

export type MicrocycleDetailPayload = {
  microcycle_id: string;
  month_template_id: string;
  name: string;
  level: string;
  start_date: string;
  end_date: string;
  scheduled_total: number;
  completed_total: number;
  compliance_pct: number | null;
  ai_adjustments_approved: number;
  weeks: MicrocycleWeekDetail[];
};

export async function loadMicrocycleDetail(params: {
  athlete_id: number | bigint;
  microcycle_id: number | bigint;
  client: Sql;
}): Promise<MicrocycleDetailPayload | null> {
  const client = params.client;

  const header = await client<
    Array<{
      microcycle_id: string;
      month_template_id: string;
      name: string;
      level: string;
      start_date: string;
      end_date: string;
    }>
  >`
    select
      ama.id::text                                   as microcycle_id,
      ama.month_template_id::text                    as month_template_id,
      m.name                                         as name,
      coalesce(al.name, '')                          as level,
      to_char(ama.start_date, 'YYYY-MM-DD')          as start_date,
      to_char(ama.end_date,   'YYYY-MM-DD')          as end_date
    from athlete_month_assignments ama
    join program_month_templates m on m.id = ama.month_template_id
    left join athlete_levels al on al.id = m.level_id
    where ama.id = ${params.microcycle_id as number}
      and ama.athlete_id = ${params.athlete_id as number}
    limit 1
  `;
  const row = header[0];
  if (!row) return null;

  const startDate = parseIsoDate(row.start_date);
  const endDate = parseIsoDate(row.end_date);

  const totals = await client<Array<{ scheduled: number; completed: number }>>`
    select
      count(*)::int                                                  as scheduled,
      count(*) filter (where wa.status = 'completed')::int           as completed
    from workout_assignments wa
    where wa.athlete_id = ${params.athlete_id as number}
      and wa.scheduled_for >= ${row.start_date}::date
      and wa.scheduled_for <= ${row.end_date}::date
  `;
  const scheduled_total = totals[0]?.scheduled ?? 0;
  const completed_total = totals[0]?.completed ?? 0;
  const compliance_pct =
    scheduled_total > 0
      ? Math.round((completed_total / scheduled_total) * 100) / 100
      : null;

  const adjRows = await client<Array<{ n: number }>>`
    select count(*)::int as n
    from week_adjustment_proposals
    where athlete_id = ${params.athlete_id as number}
      and status = 'approved'
      and verdict = 'needs_adjustment'
      and week_start >= ${row.start_date}::date
      and week_start <= ${row.end_date}::date
  `;
  const ai_adjustments_approved = adjRows[0]?.n ?? 0;

  const weekRows = await client<
    Array<{
      week_start: string;
      scheduled: number;
      completed: number;
    }>
  >`
    select
      to_char(date_trunc('week', wa.scheduled_for)::date, 'YYYY-MM-DD') as week_start,
      count(*)::int                                                     as scheduled,
      count(*) filter (where wa.status = 'completed')::int              as completed
    from workout_assignments wa
    where wa.athlete_id = ${params.athlete_id as number}
      and wa.scheduled_for >= ${row.start_date}::date
      and wa.scheduled_for <= ${row.end_date}::date
    group by 1
    order by 1 asc
  `;

  const byWeek = new Map(weekRows.map((w) => [w.week_start, w]));
  const weeks: MicrocycleWeekDetail[] = [];
  let cursor = mondayOfWeek(startDate);
  let idx = 1;
  while (cursor <= endDate) {
    const wsIso = isoDateString(cursor);
    const weIso = isoDateString(addDays(cursor, 6));
    const wk = byWeek.get(wsIso);
    const sched = wk?.scheduled ?? 0;
    const done = wk?.completed ?? 0;
    weeks.push({
      week_index: idx,
      week_start: wsIso,
      week_end: weIso,
      scheduled: sched,
      completed: done,
      compliance_pct: sched > 0 ? Math.round((done / sched) * 100) / 100 : null,
    });
    cursor = addDays(cursor, 7);
    idx += 1;
  }

  return {
    microcycle_id: row.microcycle_id,
    month_template_id: row.month_template_id,
    name: row.name,
    level: row.level,
    start_date: row.start_date,
    end_date: row.end_date,
    scheduled_total,
    completed_total,
    compliance_pct,
    ai_adjustments_approved,
    weeks,
  };
}

// =============================================================================
// ATHLETE-FACING macro views — AGNOSTIC (no ATR block, no ACC/TRANS/REAL).
//
// What the athlete sees is the COACH'S microciclo NAME + "semana N de M",
// derived from `athlete_month_assignments` (the materialization receipt: name via
// program_month_templates, dated window, microcycle_ids[] = its weeks) +
// `workout_assignments`. These read only the materialization receipt + workout_assignments (no periodization
// tables exist anymore). The `block` field is
// kept in the response SHAPE for iOS Codable parity, but is ALWAYS null — the
// athlete never receives periodization jargon. (The coach `buildMacroProgress`
// above is untouched and still ATR-aware for coach analytics.)
// =============================================================================

/** Athlete-facing subset — current week only + microciclo label. */
export async function buildAthleteMacroSummary(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client: Sql;
}): Promise<{
  block: string | null;
  week_label: string | null;
  a_event_days: number | null;
  current_week_start: string;
  current_week_end: string;
}> {
  const client = params.client;
  const today = startOfDayInBox(params.on_date ?? new Date());
  const weekStart = mondayOfWeek(today);
  const todayIso = isoDateString(today);

  const week_label = await currentMicrocicloLabel(params.athlete_id, today, todayIso, client);

  // Días hasta la carrera objetivo (unified `races` spine, priority='target').
  const targetRace = await getTargetRaceRow(params.athlete_id, client, today);

  return {
    block: null,
    week_label,
    a_event_days: targetRace?.days_until ?? null,
    current_week_start: isoDateString(weekStart),
    current_week_end: isoDateString(addDays(weekStart, 6)),
  };
}

/**
 * The athlete's CURRENT microciclo label: "<coach microciclo name> · semana N de M".
 * The current microciclo = the materialization receipt (athlete_month_assignments)
 * whose dated window contains today. N = which Mon–Sun week within that window today
 * falls in (1-indexed); M = the microciclo's week count (its microcycle_ids[], with a
 * date-span fallback). null when today is outside any materialized microciclo
 * (free-planned / between plans) → the athlete keeps the generic "Tu semana" subtitle.
 */
async function currentMicrocicloLabel(
  athlete_id: number | bigint,
  today: Date,
  todayIso: string,
  client: Sql,
): Promise<string | null> {
  const rows = await client<
    Array<{ name: string | null; start_date: string; end_date: string; week_count: number }>
  >`
    select
      m.name                                                 as name,
      to_char(ama.start_date, 'YYYY-MM-DD')                  as start_date,
      to_char(ama.end_date,   'YYYY-MM-DD')                  as end_date,
      coalesce(array_length(ama.microcycle_ids, 1), 0)::int  as week_count
    from athlete_month_assignments ama
    join program_month_templates m on m.id = ama.month_template_id
    where ama.athlete_id = ${athlete_id as number}
      and ama.start_date <= ${todayIso}::date
      and ama.end_date   >= ${todayIso}::date
    order by ama.start_date desc
    limit 1
  `;
  const r = rows[0];
  if (!r || !r.name) return null;

  const startMonday = mondayOfWeek(parseIsoDate(r.start_date));
  const spanWeeks = Math.floor(diffDays(mondayOfWeek(parseIsoDate(r.end_date)), startMonday) / 7) + 1;
  const totalWeeks = r.week_count > 0 ? r.week_count : Math.max(1, spanWeeks);
  const idx = Math.floor(diffDays(mondayOfWeek(today), startMonday) / 7) + 1;
  const weekN = Math.min(Math.max(idx, 1), totalWeeks);

  return `${r.name} · semana ${weekN} de ${totalWeeks}`;
}

export type AthleteMacroProgressPayload = {
  /** Kept null for iOS Codable parity — the athlete never receives an ATR block. */
  block: null;
  total_assigned_weeks: number;
  weeks: Array<{ week_start: string; status: MacroWeekStatus; compliance_pct: number | null }>;
};

/**
 * Athlete-facing macro PROGRESS ribbon — AGNOSTIC. Per-week compliance derived
 * purely from `workout_assignments` (no periodization coupling). Same week-status
 * semantics as the coach `buildMacroProgress` weeks (completed ≥50% / missed /
 * current / upcoming), but with zero periodization coupling.
 */
export async function buildAthleteMacroProgress(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client: Sql;
}): Promise<AthleteMacroProgressPayload> {
  const client = params.client;
  const today = startOfDayInBox(params.on_date ?? new Date());

  const rows = await client<
    Array<{ week_start: string; scheduled: number; completed: number }>
  >`
    with week_rows as (
      select
        date_trunc('week', wa.scheduled_for)::date as week_start,
        count(*)::int as scheduled,
        count(*) filter (where wa.status = 'completed')::int as completed
      from workout_assignments wa
      where wa.athlete_id = ${params.athlete_id as number}
      group by 1
    )
    select to_char(week_start, 'YYYY-MM-DD') as week_start, scheduled, completed
    from week_rows
    order by week_start asc
  `;

  const weeks = rows.map((w) => {
    const ws = parseIsoDate(w.week_start);
    const we = addDays(ws, 6);
    const compliance_pct =
      w.scheduled > 0 ? Math.round((w.completed / w.scheduled) * 100) / 100 : null;
    let status: MacroWeekStatus = 'upcoming';
    if (we < today) status = w.completed >= w.scheduled * 0.5 ? 'completed' : 'missed';
    else if (ws <= today && we >= today) status = 'current';
    return { week_start: w.week_start, status, compliance_pct };
  });

  return { block: null, total_assigned_weeks: weeks.length, weeks };
}
