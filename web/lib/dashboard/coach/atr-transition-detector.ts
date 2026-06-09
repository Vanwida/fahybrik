import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { getCurrentBlock } from '@/lib/atr/service';
import { getLoadSummary } from '@/lib/training-load';
import { addDays, isoDateString, startOfDayUtc } from '@fahybrid/shared/domain/atr/dates';
import type { AtrBlockType } from '@fahybrid/shared/domain/coach/types';

// ATR transition readiness detector (v1 heuristic, surface-only).
//
// Surfaces a defensible "ready for next block" suggestion to Pablo. Never
// auto-promotes — the coach confirms in the athlete profile / intake. The
// rules are intentionally simple and conservative; Pablo can tune the
// thresholds once we have real data.

export type AtrTransitionFromTo =
  | { from: 'ACC'; to: 'TRANS' }
  | { from: 'TRANS'; to: 'REAL' };

export type AtrTransitionNotReady = {
  ready: false;
  current_block: AtrBlockType | null;
  reason: string;
};

export type AtrTransitionReady = AtrTransitionFromTo & {
  ready: true;
  rationale: string[];
};

export type AtrTransitionReadiness = AtrTransitionReady | AtrTransitionNotReady;

// Thresholds — Pablo will tune with real data.
const ACC_MIN_WEEKS = 8;            // ≥ 8 weeks in ACC before suggesting TRANS
const TRANS_MIN_WEEKS = 6;          // ≥ 6 weeks in TRANS before suggesting REAL
const ACC_COMPLIANCE_MIN = 0.75;    // 75% over last 4 weeks
const TRANS_COMPLIANCE_MIN = 0.70;  // 70% over last 4 weeks (a touch laxer)
const REAL_MAX_A_EVENT_WEEKS = 12;  // peaking window
const TSB_STABLE_MIN = -15;         // load trend stable or rising

const NOT_READY_REASONS = {
  no_active_block: 'sin macrociclo activo',
  weeks_short: 'aún en bloque actual',
  compliance_low: 'cumplimiento bajo',
  injury_active: 'lesión activa',
  load_dropping: 'carga decreciente / fatiga alta',
  no_a_event_window: 'A-event aún fuera del pico',
  terminal_block: 'ya en bloque final',
} as const;

type InjuryRow = { active: boolean };

async function hasActiveInjury(params: {
  athlete_id: number | bigint;
  client: Sql;
}): Promise<boolean> {
  const rows = await params.client<Array<{ injuries_json: InjuryRow[] | null }>>`
    select injuries_json
    from athletes
    where id = ${params.athlete_id as number}
    limit 1
  `;
  const injuries = rows[0]?.injuries_json ?? [];
  return Array.isArray(injuries) && injuries.some((i) => i?.active === true);
}

async function complianceLast4Weeks(params: {
  athlete_id: number | bigint;
  today_iso: string;
  client: Sql;
}): Promise<number | null> {
  const fourWeeksAgoIso = isoDateString(addDays(startOfDayUtc(new Date(params.today_iso)), -28));
  const rows = await params.client<Array<{ scheduled: number; completed: number }>>`
    select
      count(*) filter (
        where wa.scheduled_for >= ${fourWeeksAgoIso}::date
          and wa.scheduled_for <= ${params.today_iso}::date
      )::int as scheduled,
      count(*) filter (
        where wa.scheduled_for >= ${fourWeeksAgoIso}::date
          and wa.scheduled_for <= ${params.today_iso}::date
          and wa.status = 'completed'
      )::int as completed
    from workout_assignments wa
    where wa.athlete_id = ${params.athlete_id as number}
  `;
  const r = rows[0];
  if (!r || r.scheduled === 0) return null;
  return r.completed / r.scheduled;
}

async function weeksInCurrentBlock(params: {
  block_id: bigint;
  today_iso: string;
  client: Sql;
}): Promise<number> {
  const rows = await params.client<Array<{ weeks: number }>>`
    select greatest(
      0,
      ceil((least(${params.today_iso}::date, b.end_date) - b.start_date + 1) / 7.0)
    )::int as weeks
    from atr_blocks b
    where b.id = ${params.block_id as unknown as number}
  `;
  return rows[0]?.weeks ?? 0;
}

async function aEventDays(params: {
  athlete_id: number | bigint;
  today_iso: string;
  client: Sql;
}): Promise<number | null> {
  const rows = await params.client<Array<{ days: number }>>`
    select (e.start_date - ${params.today_iso}::date)::int as days
    from athlete_target_events ate
    join events e on e.id = ate.event_id
    where ate.athlete_id = ${params.athlete_id as number}
      and ate.priority = 'A'
      and e.start_date >= ${params.today_iso}::date
    order by e.start_date asc
    limit 1
  `;
  return rows[0]?.days ?? null;
}

export async function evaluateAtrTransitionReadiness(params: {
  athlete_id: number | bigint;
  on_date?: Date | undefined;
  client?: Sql | undefined;
}): Promise<AtrTransitionReadiness> {
  const client = params.client ?? defaultSql;
  const today = startOfDayUtc(params.on_date ?? new Date());
  const todayIso = isoDateString(today);

  const block = await getCurrentBlock({
    athlete_id: params.athlete_id,
    on_date: today,
    client,
  });
  if (!block) {
    return { ready: false, current_block: null, reason: NOT_READY_REASONS.no_active_block };
  }

  if (block.block_type === 'REAL') {
    return { ready: false, current_block: 'REAL', reason: NOT_READY_REASONS.terminal_block };
  }

  // Lesión activa → corta de raíz (vale para ambas transiciones).
  if (await hasActiveInjury({ athlete_id: params.athlete_id, client })) {
    return {
      ready: false,
      current_block: block.block_type,
      reason: NOT_READY_REASONS.injury_active,
    };
  }

  const weeks = await weeksInCurrentBlock({
    block_id: block.block_id,
    today_iso: todayIso,
    client,
  });
  const compliance = await complianceLast4Weeks({
    athlete_id: params.athlete_id,
    today_iso: todayIso,
    client,
  });
  const load = await getLoadSummary({
    athlete_id: params.athlete_id,
    on_date: today,
    client,
  });

  if (block.block_type === 'ACC') {
    if (weeks < ACC_MIN_WEEKS) {
      return { ready: false, current_block: 'ACC', reason: NOT_READY_REASONS.weeks_short };
    }
    if (compliance == null || compliance < ACC_COMPLIANCE_MIN) {
      return { ready: false, current_block: 'ACC', reason: NOT_READY_REASONS.compliance_low };
    }
    if (load.tsb < TSB_STABLE_MIN) {
      return { ready: false, current_block: 'ACC', reason: NOT_READY_REASONS.load_dropping };
    }
    return {
      ready: true,
      from: 'ACC',
      to: 'TRANS',
      rationale: [
        `${weeks} semanas en ACC (≥ ${ACC_MIN_WEEKS}).`,
        `Cumplimiento 4 sem: ${(compliance * 100).toFixed(0)}% (≥ ${ACC_COMPLIANCE_MIN * 100}%).`,
        `Sin lesión activa.`,
        `TSB ${load.tsb.toFixed(0)} estable.`,
      ],
    };
  }

  // block.block_type === 'TRANS'
  if (weeks < TRANS_MIN_WEEKS) {
    return { ready: false, current_block: 'TRANS', reason: NOT_READY_REASONS.weeks_short };
  }
  if (compliance == null || compliance < TRANS_COMPLIANCE_MIN) {
    return { ready: false, current_block: 'TRANS', reason: NOT_READY_REASONS.compliance_low };
  }
  const days = await aEventDays({ athlete_id: params.athlete_id, today_iso: todayIso, client });
  if (days != null && days > REAL_MAX_A_EVENT_WEEKS * 7) {
    return { ready: false, current_block: 'TRANS', reason: NOT_READY_REASONS.no_a_event_window };
  }

  const rationale = [
    `${weeks} semanas en TRANS (≥ ${TRANS_MIN_WEEKS}).`,
    `Cumplimiento 4 sem: ${(compliance * 100).toFixed(0)}% (≥ ${TRANS_COMPLIANCE_MIN * 100}%).`,
    `Sin lesión activa.`,
  ];
  if (days != null) {
    rationale.push(`A-event a ${days} días (≤ ${REAL_MAX_A_EVENT_WEEKS} semanas, entra en pico).`);
  } else {
    rationale.push('Sin A-event fechado: REAL queda a criterio.');
  }

  return { ready: true, from: 'TRANS', to: 'REAL', rationale };
}
