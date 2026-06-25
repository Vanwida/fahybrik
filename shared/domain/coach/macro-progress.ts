import type { Sql } from 'postgres';
import { getCurrentBlock } from '../atr/service';
import { addDays, isoDateString, mondayOfWeek, parseIsoDate, startOfDayInBox } from '../atr/dates';
import type { AtrBlockType } from './types';

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
  atr_block_hint: AtrBlockType | null;
  start_date: string;
  end_date: string;
};

/**
 * Tramo real de un bloque ATR derivado de atr_blocks → microcycles.
 * `week_count` = nº de microciclos del bloque (ACC 5 / TRANS 4 / REAL 3, etc.);
 * NUNCA asumir 4. `first_week` = week_number macro-relativo del primer microciclo
 * del bloque, usado para convertir week_number macro (1..N) a semana relativa al
 * bloque: `block_week = current.week_number - first_week + 1`.
 */
export type MacroBlockSpan = {
  block_type: AtrBlockType;
  position: number;
  first_week: number;
  week_count: number;
};

export type MacroProgressPayload = {
  athlete_id: string;
  macrocycle_id: string | null;
  block: AtrBlockType | null;
  /**
   * Coach phase id (methodology_phases.id) of the ACTIVE block — drives the phase
   * resolver so the Hub header / context rail / calendar show the coach's phase
   * name, identical to the Macro roadmap. null pre-migration or for a legacy
   * block → the resolver falls back to the ATR label.
   */
  block_phase_id: string | null;
  current_microcycle_index: number;
  /**
   * Semana ACTUAL relativa al bloque activo (1-indexed): para A2 hoy → ACC
   * semana 4. Derivada de atr_blocks/microcycles (week_number − first_week + 1),
   * NO del índice de asignaciones. null si no hay bloque activo.
   */
  block_week: number | null;
  /**
   * Tramos reales de los bloques ATR del macrociclo (week_count por bloque).
   * Fuente única para el relleno del ribbon — no hardcodear 4 semanas/fase.
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
  const todayIso = isoDateString(today);

  const block = await getCurrentBlock({
    athlete_id: params.athlete_id,
    on_date: today,
    client,
  });

  // Tramos reales de cada bloque ATR del macrociclo activo: first_week
  // (week_number macro del primer microciclo) + week_count (nº de microciclos).
  // Fuente única de las semanas/fase — DRY con getCurrentBlock, misma data.
  const blockSpanRows = block
    ? await client<
        Array<{
          block_type: AtrBlockType;
          position: number;
          first_week: number;
          week_count: number;
        }>
      >`
        select
          b.type                  as block_type,
          b.position              as position,
          min(mc.week_number)::int as first_week,
          count(mc.id)::int        as week_count
        from atr_blocks b
        join microcycles mc on mc.block_id = b.id
        where b.macrocycle_id = ${block.macrocycle_id as unknown as number}
        group by b.type, b.position
        order by b.position asc
      `
    : [];

  const block_spans: MacroBlockSpan[] = blockSpanRows.map((r) => ({
    block_type: r.block_type,
    position: r.position,
    first_week: r.first_week,
    week_count: r.week_count,
  }));

  // Semana relativa al bloque activo: week_number macro − first_week + 1.
  const activeSpan = block ? block_spans.find((s) => s.block_type === block.block_type) : null;
  const block_week =
    block && activeSpan ? block.week_number - activeSpan.first_week + 1 : null;

  const aEventRows = await client<Array<{ days: number }>>`
    select (e.start_date - ${todayIso}::date)::int as days
    from athlete_target_events ate
    join events e on e.id = ate.event_id
    where ate.athlete_id = ${params.athlete_id as number}
      and ate.priority = 'A'
      and e.start_date >= ${todayIso}::date
    order by e.start_date asc limit 1
  `;

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
      atr_block_hint: string | null;
      start_date: string;
      end_date: string;
    }>
  >`
    select
      ama.id::text                                    as microcycle_id,
      ama.month_template_id::text                     as month_template_id,
      m.name                                          as name,
      m.level::text                                   as level,
      m.atr_block_hint::text                          as atr_block_hint,
      to_char(ama.start_date, 'YYYY-MM-DD')           as start_date,
      to_char(ama.end_date,   'YYYY-MM-DD')           as end_date
    from athlete_month_assignments ama
    join program_month_templates m on m.id = ama.month_template_id
    where ama.athlete_id = ${params.athlete_id as number}
    order by ama.start_date asc
  `;

  const phase_assignments: MacroPhaseAssignment[] = phaseRows.map((r) => ({
    microcycle_id: r.microcycle_id,
    month_template_id: r.month_template_id,
    name: r.name,
    level: r.level,
    atr_block_hint: (r.atr_block_hint as AtrBlockType | null) ?? null,
    start_date: r.start_date,
    end_date: r.end_date,
  }));

  return {
    athlete_id: String(params.athlete_id),
    macrocycle_id: block ? String(block.macrocycle_id) : null,
    block: block?.block_type ?? null,
    block_phase_id: block?.phase_id ?? null,
    current_microcycle_index: monthAssignCount[0]?.n ?? 0,
    block_week,
    block_spans,
    weeks,
    total_assigned_weeks: weeks.length,
    a_event_days: aEventRows[0]?.days ?? null,
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
  atr_block_hint: AtrBlockType | null;
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
      atr_block_hint: string | null;
      start_date: string;
      end_date: string;
    }>
  >`
    select
      ama.id::text                                   as microcycle_id,
      ama.month_template_id::text                    as month_template_id,
      m.name                                         as name,
      m.level::text                                  as level,
      m.atr_block_hint::text                         as atr_block_hint,
      to_char(ama.start_date, 'YYYY-MM-DD')          as start_date,
      to_char(ama.end_date,   'YYYY-MM-DD')          as end_date
    from athlete_month_assignments ama
    join program_month_templates m on m.id = ama.month_template_id
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
    atr_block_hint: (row.atr_block_hint as AtrBlockType | null) ?? null,
    start_date: row.start_date,
    end_date: row.end_date,
    scheduled_total,
    completed_total,
    compliance_pct,
    ai_adjustments_approved,
    weeks,
  };
}

/** Athlete-facing subset — current week only + macro summary. */
export async function buildAthleteMacroSummary(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client: Sql;
}): Promise<{
  block: AtrBlockType | null;
  week_label: string | null;
  a_event_days: number | null;
  current_week_start: string;
  current_week_end: string;
}> {
  const today = startOfDayInBox(params.on_date ?? new Date());
  const weekStart = mondayOfWeek(today);
  const progress = await buildMacroProgress(params);
  const block = progress.block;
  const current = progress.weeks.find((w) => w.status === 'current');

  return {
    block,
    // Semana relativa al bloque activo (A2 hoy → "ACC · semana 4"), derivada de
    // atr_blocks/microcycles — no del índice de asignaciones de mes.
    week_label:
      block && current && progress.block_week != null
        ? `${block} · semana ${progress.block_week}`
        : null,
    a_event_days: progress.a_event_days,
    current_week_start: isoDateString(weekStart),
    current_week_end: isoDateString(addDays(weekStart, 6)),
  };
}
