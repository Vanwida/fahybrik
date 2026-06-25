import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { getCurrentBlock } from '@/lib/atr/service';
import { getLoadSummary } from '@/lib/training-load';
import { addDays, isoDateString, startOfDayUtc } from '@fahybrid/shared/domain/atr/dates';
import { atrPhaseLabel } from '@/lib/dashboard/constants/atr-phases';

// Phase-transition readiness detector (v1 heuristic, surface-only).
//
// Keyed off the legacy ATR block enum (atr_blocks.type: ACC → TRANS → REAL).
// "ready to advance" = the current block's criteria are met AND a next block
// exists in the legacy sequence (terminal = REAL / last position). Surfaces a
// defensible "ready for next block" suggestion to Pablo; never auto-promotes —
// the coach confirms. Thresholds are conservative and tunable with real data.

export type AtrTransitionNotReady = {
  ready: false;
  /** Current block label (legacy ATR full word), null if no active block. */
  current_block: string | null;
  reason: string;
};

export type AtrTransitionReady = {
  ready: true;
  /** Current (from) block label. */
  from: string;
  /** Next (to) block label, from the legacy ATR sequence. */
  to: string;
  rationale: string[];
};

export type AtrTransitionReadiness = AtrTransitionReady | AtrTransitionNotReady;

// Readiness thresholds, keyed by the legacy ATR block type. ACC ≥8w/75% ·
// TRANS ≥6w/70% · REAL ≥2w/70%. Pablo can tune with real data.
const BLOCK_THRESHOLDS: Record<string, { minWeeks: number; complianceMin: number }> = {
  ACC: { minWeeks: 8, complianceMin: 0.75 },
  TRANS: { minWeeks: 6, complianceMin: 0.7 },
  REAL: { minWeeks: 2, complianceMin: 0.7 },
};
const DEFAULT_THRESHOLDS = { minWeeks: 6, complianceMin: 0.7 };

// Legacy ATR temporal order. Terminal = the last entry (REAL).
const LEGACY_ORDER = ['ACC', 'TRANS', 'REAL'] as const;

const REAL_MAX_A_EVENT_WEEKS = 12; // peaking window — only gates the move into REAL.
const TSB_STABLE_MIN = -15; // load trend stable or rising (gates the ACC volume block).

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

/**
 * Resolve the CURRENT block + the NEXT block in the legacy ATR sequence
 * (ACC → TRANS → REAL). Returns `next: null` when the current block is the last
 * (terminal) one.
 */
function resolveSequence(block_type: string): {
  current_label: string;
  next_type: string | null;
  next_label: string | null;
} {
  const idx = LEGACY_ORDER.indexOf(block_type as (typeof LEGACY_ORDER)[number]);
  const nextType = idx >= 0 ? LEGACY_ORDER[idx + 1] ?? null : null;
  return {
    current_label: atrPhaseLabel(block_type),
    next_type: nextType,
    next_label: nextType ? atrPhaseLabel(nextType) : null,
  };
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

  const { current_label, next_type, next_label } = resolveSequence(block.block_type);

  // Terminal block: no next in the legacy sequence → nothing to advance to.
  if (!next_type || !next_label) {
    return { ready: false, current_block: current_label, reason: NOT_READY_REASONS.terminal_block };
  }

  // Lesión activa → corta de raíz (vale para cualquier transición).
  if (await hasActiveInjury({ athlete_id: params.athlete_id, client })) {
    return {
      ready: false,
      current_block: current_label,
      reason: NOT_READY_REASONS.injury_active,
    };
  }

  const thresholds = BLOCK_THRESHOLDS[block.block_type] ?? DEFAULT_THRESHOLDS;
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

  if (weeks < thresholds.minWeeks) {
    return { ready: false, current_block: current_label, reason: NOT_READY_REASONS.weeks_short };
  }
  if (compliance == null || compliance < thresholds.complianceMin) {
    return { ready: false, current_block: current_label, reason: NOT_READY_REASONS.compliance_low };
  }

  // ACC (volume) gates on a stable/rising load trend (no deep fatigue).
  if (block.block_type === 'ACC' && load.tsb < TSB_STABLE_MIN) {
    return { ready: false, current_block: current_label, reason: NOT_READY_REASONS.load_dropping };
  }

  const rationale: string[] = [
    `${weeks} semanas en ${current_label} (≥ ${thresholds.minWeeks}).`,
    `Cumplimiento 4 sem: ${(compliance * 100).toFixed(0)}% (≥ ${Math.round(thresholds.complianceMin * 100)}%).`,
    `Sin lesión activa.`,
  ];

  if (block.block_type === 'ACC') {
    rationale.push(`TSB ${load.tsb.toFixed(0)} estable.`);
  }

  // When advancing INTO the REAL (peak) block, gate on the A-event peaking window.
  if (next_type === 'REAL') {
    const days = await aEventDays({ athlete_id: params.athlete_id, today_iso: todayIso, client });
    if (days != null && days > REAL_MAX_A_EVENT_WEEKS * 7) {
      return {
        ready: false,
        current_block: current_label,
        reason: NOT_READY_REASONS.no_a_event_window,
      };
    }
    if (days != null) {
      rationale.push(
        `A-event a ${days} días (≤ ${REAL_MAX_A_EVENT_WEEKS} semanas, entra en pico).`,
      );
    } else {
      rationale.push(`Sin A-event fechado: ${next_label} queda a criterio.`);
    }
  }

  return { ready: true, from: current_label, to: next_label, rationale };
}
