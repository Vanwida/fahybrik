// ATR service layer — connects the pure planner/transition logic to Postgres.
//
// Public surface:
//   - computeMacrocycle(athlete_id, target_event_id) → persists macro/blocks/microcycles
//   - getCurrentBlock(athlete_id, on_date)
//   - getNextWorkout(athlete_id, on_date)
//   - recommendTransition(athlete_id) → assesses readiness for next block

import type { Sql } from 'postgres';
import { getLoadSummary } from '../training-load';
import {
  DEFAULT_BLOCK_SPECS,
  findCurrentBlock,
  planMacrocycle,
  type AtrBlockType,
  type BlockSpec,
  type PlannedMacrocycle,
} from './planner';
import { addDays, isoDateString, parseIsoDate, startOfDayInBox } from './dates';
import { recommendTransition as evaluateTransition, type TransitionRecommendation } from './transitions';
export { evaluateTransition };

export type ComputeMacrocycleResult = {
  macrocycle_id: bigint;
  start_date: string;
  end_date: string;
  blocks: Array<{
    id: bigint;
    type: AtrBlockType;
    position: number;
    start_date: string;
    end_date: string;
    microcycles: Array<{ id: bigint; week_number: number; start_date: string; end_date: string }>;
  }>;
};

export async function computeMacrocycle(params: {
  athlete_id: number | bigint;
  target_event_id: number | bigint;
  block_specs?: ReadonlyArray<BlockSpec>;
  client: Sql;
}): Promise<ComputeMacrocycleResult> {
  const client = params.client;

  const eventRows = await client<Array<{ start_date: string }>>`
    select to_char(start_date, 'YYYY-MM-DD') as start_date
    from events
    where id = ${params.target_event_id as number}
    limit 1
  `;
  const eventRow = eventRows[0];
  if (!eventRow) {
    throw new AtrError('event_not_found', `target event ${params.target_event_id} not found`);
  }
  const eventDate = parseIsoDate(eventRow.start_date);

  if (eventDate < startOfDayInBox(new Date())) {
    throw new AtrError('event_in_past', `target event ${params.target_event_id} is in the past`);
  }

  const plan = planMacrocycle({
    target_event_date: eventDate,
    block_specs: params.block_specs ?? DEFAULT_BLOCK_SPECS,
  });

  return await client.begin(async (tx) => {
    const macroInsert = await tx<Array<{ id: bigint }>>`
      insert into atr_macrocycles (athlete_id, target_event_id, start_date, end_date, status)
      values (
        ${params.athlete_id as number},
        ${params.target_event_id as number},
        ${plan.start_date}::date,
        ${plan.end_date}::date,
        'planned'
      )
      returning id
    `;
    const macrocycle_id = macroInsert[0]!.id;

    const blocks: ComputeMacrocycleResult['blocks'] = [];
    for (const block of plan.blocks) {
      const blockInsert = await tx<Array<{ id: bigint }>>`
        insert into atr_blocks (
          macrocycle_id, type, position, start_date, end_date, status
        )
        values (
          ${macrocycle_id as unknown as number},
          ${block.type},
          ${block.position},
          ${block.start_date}::date,
          ${block.end_date}::date,
          'planned'
        )
        returning id
      `;
      const block_id = blockInsert[0]!.id;

      const microRows: Array<{ id: bigint; week_number: number; start_date: string; end_date: string }> = [];
      for (const micro of block.microcycles) {
        const microInsert = await tx<Array<{ id: bigint }>>`
          insert into microcycles (block_id, week_number, start_date, end_date)
          values (
            ${block_id as unknown as number},
            ${micro.week_number},
            ${micro.start_date}::date,
            ${micro.end_date}::date
          )
          returning id
        `;
        microRows.push({
          id: microInsert[0]!.id,
          week_number: micro.week_number,
          start_date: micro.start_date,
          end_date: micro.end_date,
        });
      }

      blocks.push({
        // El planner generalizó `type` a string (fases de coach arbitrarias).
        // computeMacrocycle inserta en la columna enum `atr_blocks.type`, así que
        // aquí el código es siempre ATR legacy (DEFAULT_BLOCK_SPECS) → narrow.
        id: block_id,
        type: block.type as AtrBlockType,
        position: block.position,
        start_date: block.start_date,
        end_date: block.end_date,
        microcycles: microRows,
      });
    }

    return {
      macrocycle_id,
      start_date: plan.start_date,
      end_date: plan.end_date,
      blocks,
    };
  });
}

export type CurrentBlockResult = {
  macrocycle_id: bigint;
  block_id: bigint;
  block_type: AtrBlockType;
  block_position: number;
  microcycle_id: bigint;
  week_number: number;
  weeks_to_event: number;
};

export async function getCurrentBlock(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client: Sql;
}): Promise<CurrentBlockResult | null> {
  const client = params.client;
  const today = startOfDayInBox(params.on_date ?? new Date());
  const todayIso = isoDateString(today);

  const rows = await client<
    Array<{
      macrocycle_id: bigint;
      block_id: bigint;
      block_type: AtrBlockType;
      block_position: number;
      microcycle_id: bigint;
      week_number: number;
      macro_end: string;
    }>
  >`
    select
      m.id as macrocycle_id,
      b.id as block_id,
      b.type as block_type,
      b.position as block_position,
      mc.id as microcycle_id,
      mc.week_number,
      to_char(m.end_date, 'YYYY-MM-DD') as macro_end
    from atr_macrocycles m
    join atr_blocks b on b.macrocycle_id = m.id
    join microcycles mc on mc.block_id = b.id
    where m.athlete_id = ${params.athlete_id as number}
      and m.status in ('planned', 'active')
      and ${todayIso}::date between mc.start_date and mc.end_date
    order by m.start_date desc, b.position asc
    limit 1
  `;

  const row = rows[0];
  if (!row) return null;

  const macroEnd = parseIsoDate(row.macro_end);
  const weeks_to_event = Math.max(0, Math.ceil((macroEnd.getTime() - today.getTime()) / 86_400_000 / 7));

  return {
    macrocycle_id: row.macrocycle_id,
    block_id: row.block_id,
    block_type: row.block_type,
    block_position: row.block_position,
    microcycle_id: row.microcycle_id,
    week_number: row.week_number,
    weeks_to_event,
  };
}

export type NextWorkoutResult = {
  assignment_id: bigint;
  scheduled_for: string;
  template_id: bigint;
  template_version: number;
  status: string;
  microcycle_id: bigint | null;
} | null;

export async function getNextWorkout(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client: Sql;
}): Promise<NextWorkoutResult> {
  const client = params.client;
  const todayIso = isoDateString(startOfDayInBox(params.on_date ?? new Date()));

  const rows = await client<
    Array<{
      id: bigint;
      scheduled_for: string;
      template_id: bigint;
      template_version: number;
      status: string;
      microcycle_id: bigint | null;
    }>
  >`
    select
      id,
      to_char(scheduled_for, 'YYYY-MM-DD') as scheduled_for,
      template_id,
      template_version,
      status,
      microcycle_id
    from workout_assignments
    where athlete_id = ${params.athlete_id as number}
      and scheduled_for >= ${todayIso}::date
      and status = 'scheduled'
    order by scheduled_for asc, id asc
    limit 1
  `;

  const row = rows[0];
  if (!row) return null;
  return {
    assignment_id: row.id,
    scheduled_for: row.scheduled_for,
    template_id: row.template_id,
    template_version: row.template_version,
    status: row.status,
    microcycle_id: row.microcycle_id,
  };
}

export type AthleteTransitionRecommendation = TransitionRecommendation & {
  current_block_type: AtrBlockType | null;
  load: { ctl: number; atl: number; tsb: number; acr: number };
  compliance_pct: number;
};

export async function recommendAthleteTransition(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client: Sql;
}): Promise<AthleteTransitionRecommendation | null> {
  const client = params.client;
  const today = startOfDayInBox(params.on_date ?? new Date());

  const current = await getCurrentBlock({
    athlete_id: params.athlete_id,
    on_date: today,
    client,
  });
  if (!current) return null;

  // Compliance for current block: completed / scheduled (excluding future-dated ones).
  const todayIso = isoDateString(today);
  const complianceRows = await client<
    Array<{ scheduled: number; completed: number }>
  >`
    select
      count(*) filter (where wa.scheduled_for <= ${todayIso}::date)::int as scheduled,
      count(*) filter (
        where wa.scheduled_for <= ${todayIso}::date and wa.status = 'completed'
      )::int as completed
    from workout_assignments wa
    join microcycles mc on mc.id = wa.microcycle_id
    where wa.athlete_id = ${params.athlete_id as number}
      and mc.block_id = ${current.block_id as unknown as number}
  `;
  const compliance_pct = complianceRows[0]?.scheduled
    ? (complianceRows[0].completed / complianceRows[0].scheduled)
    : 1;

  const load = await getLoadSummary({
    athlete_id: params.athlete_id,
    on_date: today,
    client,
  });

  // Benchmark progression — mean % change of latest value in this block vs the
  // most recent value before the block started, per exercise_slug. Returns null
  // if no benchmarks at all (avoids spurious low-confidence signals).
  const blockRows = await client<Array<{ start_date: string; planned_weeks: number }>>`
    select
      to_char(b.start_date, 'YYYY-MM-DD') as start_date,
      ((b.end_date - b.start_date + 1) / 7)::int as planned_weeks
    from atr_blocks b
    where b.id = ${current.block_id as unknown as number}
  `;
  const blockStartIso = blockRows[0]?.start_date ?? null;
  const planned_weeks = blockRows[0]?.planned_weeks ?? 1;

  let benchmark_progression_pct: number | null = null;
  if (blockStartIso) {
    const benchRows = await client<Array<{ pct_change: number }>>`
      with current as (
        select distinct on (exercise_slug)
          exercise_slug, value, recorded_at
        from athlete_benchmarks
        where athlete_id = ${params.athlete_id as number}
          and recorded_at >= ${blockStartIso}::date
        order by exercise_slug, recorded_at desc
      ),
      baseline as (
        select distinct on (exercise_slug)
          exercise_slug, value
        from athlete_benchmarks
        where athlete_id = ${params.athlete_id as number}
          and recorded_at < ${blockStartIso}::date
        order by exercise_slug, recorded_at desc
      )
      select
        ((c.value - b.value) / nullif(b.value, 0) * 100)::float as pct_change
      from current c
      join baseline b using (exercise_slug)
      where b.value > 0
    `;
    if (benchRows.length > 0) {
      const sum = benchRows.reduce((s, r) => s + (r.pct_change ?? 0), 0);
      benchmark_progression_pct = sum / benchRows.length;
    }
  }

  // Weeks-completed-in-block: how many *full* microcycles have ended by today.
  const weeks_completed_in_block = Math.min(current.week_number - 1, planned_weeks);

  const rec = evaluateTransition({
    current_block_type: current.block_type,
    weeks_completed_in_block: weeks_completed_in_block + (today.getTime() >= addDays(parseIsoDate(blockStartIso ?? '1970-01-01'), (current.week_number - 1) * 7 + 6).getTime() ? 1 : 0),
    planned_weeks_in_block: planned_weeks,
    compliance_pct,
    load: { ctl: load.ctl, atl: load.atl, tsb: load.tsb, acr: load.acr },
    benchmark_progression_pct,
  });

  return {
    ...rec,
    current_block_type: current.block_type,
    load: { ctl: load.ctl, atl: load.atl, tsb: load.tsb, acr: load.acr },
    compliance_pct,
  };
}

export class AtrError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'AtrError';
  }
}

// Re-export pure planner pieces for callers/tests.
export { planMacrocycle, findCurrentBlock, DEFAULT_BLOCK_SPECS };
export type { BlockSpec, PlannedMacrocycle };
