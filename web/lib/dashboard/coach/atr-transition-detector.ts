import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { getCurrentBlock } from '@/lib/atr/service';
import { getLoadSummary } from '@/lib/training-load';
import { addDays, isoDateString, startOfDayUtc } from '@fahybrid/shared/domain/atr/dates';
import type { MethodologyPhase } from '@fahybrid/shared/schema/methodology-phases';
import type { PhaseRole } from '@fahybrid/shared/schema/_primitives';
import { resolvePhase } from '@/lib/dashboard/coach/phases';
import { atrPhaseLabel } from '@/lib/dashboard/constants/atr-phases';

// Phase-transition readiness detector (v1 heuristic, surface-only).
//
// CONFIG-DRIVEN: the phase sequence comes from the coach's methodology_phases
// (ordered by sequence_order). "ready to advance" = the current block's criteria
// are met AND a next phase exists in the coach's sequence. There is NO hardcoded
// ACC→TRANS→REAL graph and no `=== 'REAL'` terminal assumption: the terminal
// block is simply the LAST phase in the coach's sequence.
//
// When the coach has no configured phases (e.g. before 0052 is applied), the
// sequence falls back to the legacy ATR enum (ACC → TRANS → REAL via the block
// position / type), so the detector keeps working exactly as before.
//
// Surfaces a defensible "ready for next block" suggestion to Pablo. Never
// auto-promotes — the coach confirms in the athlete profile / intake. Thresholds
// are conservative; readiness thresholds are per-role (sensible defaults).

/** A phase position within the coach's ordered sequence. */
type SequencedPhase = {
  /** Display label (coach phase label, or legacy ATR full-word label). */
  label: string;
  role: PhaseRole;
  sequence_order: number;
};

export type AtrTransitionNotReady = {
  ready: false;
  /** Current block label (coach phase or legacy), null if no active block. */
  current_block: string | null;
  reason: string;
};

export type AtrTransitionReady = {
  ready: true;
  /** Current (from) phase label. */
  from: string;
  /** Next (to) phase label, from the coach's sequence. */
  to: string;
  rationale: string[];
};

export type AtrTransitionReadiness = AtrTransitionReady | AtrTransitionNotReady;

// Readiness thresholds, keyed by the agnostic role of the CURRENT phase. The
// legacy ATR defaults map: ACC(volume) ≥8w/75% · TRANS(intensity) ≥6w/70%.
// Other roles get sensible defaults. Pablo can tune with real data.
const ROLE_THRESHOLDS: Record<PhaseRole, { minWeeks: number; complianceMin: number }> = {
  volume: { minWeeks: 8, complianceMin: 0.75 },
  intensity: { minWeeks: 6, complianceMin: 0.7 },
  peak: { minWeeks: 2, complianceMin: 0.7 },
  recovery: { minWeeks: 1, complianceMin: 0.5 },
  maintenance: { minWeeks: 4, complianceMin: 0.7 },
};
const DEFAULT_THRESHOLDS = { minWeeks: 6, complianceMin: 0.7 };

const REAL_MAX_A_EVENT_WEEKS = 12; // peaking window — only gates the peak phase.
const TSB_STABLE_MIN = -15; // load trend stable or rising (gates volume phases).

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
 * Resolve the CURRENT phase + the NEXT phase in the coach's ordered sequence.
 *
 * The "from" phase is resolved via `resolvePhase` (coach phase by phase_id, else
 * legacy ATR enum). The "to" phase is the next one by sequence_order:
 *   - with coach phases: the phase whose sequence_order immediately follows.
 *   - fallback (no coach phases): the legacy ACC→TRANS→REAL order, taken from the
 *     block position (so a block beyond the last is terminal).
 * Returns `next: null` when the current block is the LAST in the sequence.
 */
function resolveSequence(params: {
  block: { block_type: string; block_position: number; phase_id?: number | bigint | string | null };
  coachPhases: ReadonlyArray<MethodologyPhase>;
}): { current: SequencedPhase; next: SequencedPhase | null } {
  const { block, coachPhases } = params;
  const resolved = resolvePhase(
    { type: block.block_type, phase_id: block.phase_id ?? null },
    coachPhases,
  );
  const current: SequencedPhase = {
    label: resolved.label,
    role: resolved.role,
    sequence_order: resolved.sequence_order,
  };

  if (coachPhases.length > 0) {
    // Coach-configured sequence: next = lowest sequence_order strictly greater.
    const ordered = [...coachPhases].sort((a, b) => a.sequence_order - b.sequence_order);
    const next = ordered.find((p) => p.sequence_order > current.sequence_order) ?? null;
    return {
      current,
      next: next
        ? { label: next.label, role: next.role as PhaseRole, sequence_order: next.sequence_order }
        : null,
    };
  }

  // Fallback: legacy ATR order via block position (ACC=0 → TRANS=1 → REAL=2).
  // Terminal = the last legacy phase (REAL / position 2 or beyond).
  const LEGACY_ORDER: ReadonlyArray<{ code: string; role: PhaseRole }> = [
    { code: 'ACC', role: 'volume' },
    { code: 'TRANS', role: 'intensity' },
    { code: 'REAL', role: 'peak' },
  ];
  const idx = LEGACY_ORDER.findIndex((p) => p.code === block.block_type);
  const nextEntry = idx >= 0 ? LEGACY_ORDER[idx + 1] : undefined;
  return {
    current,
    next: nextEntry
      ? { label: atrPhaseLabel(nextEntry.code), role: nextEntry.role, sequence_order: idx + 1 }
      : null,
  };
}

export async function evaluateAtrTransitionReadiness(params: {
  athlete_id: number | bigint;
  /** Coach's configured phases (ordered). [] → legacy ATR sequence fallback. */
  coachPhases?: ReadonlyArray<MethodologyPhase> | undefined;
  on_date?: Date | undefined;
  client?: Sql | undefined;
}): Promise<AtrTransitionReadiness> {
  const client = params.client ?? defaultSql;
  const coachPhases = params.coachPhases ?? [];
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

  const { current, next } = resolveSequence({ block, coachPhases });

  // Terminal phase: no next in the coach's sequence → nothing to advance to.
  if (!next) {
    return { ready: false, current_block: current.label, reason: NOT_READY_REASONS.terminal_block };
  }

  // Lesión activa → corta de raíz (vale para cualquier transición).
  if (await hasActiveInjury({ athlete_id: params.athlete_id, client })) {
    return {
      ready: false,
      current_block: current.label,
      reason: NOT_READY_REASONS.injury_active,
    };
  }

  const thresholds = ROLE_THRESHOLDS[current.role] ?? DEFAULT_THRESHOLDS;
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
    return { ready: false, current_block: current.label, reason: NOT_READY_REASONS.weeks_short };
  }
  if (compliance == null || compliance < thresholds.complianceMin) {
    return { ready: false, current_block: current.label, reason: NOT_READY_REASONS.compliance_low };
  }

  // Volume-role blocks gate on a stable/rising load trend (no deep fatigue).
  if (current.role === 'volume' && load.tsb < TSB_STABLE_MIN) {
    return { ready: false, current_block: current.label, reason: NOT_READY_REASONS.load_dropping };
  }

  const rationale: string[] = [
    `${weeks} semanas en ${current.label} (≥ ${thresholds.minWeeks}).`,
    `Cumplimiento 4 sem: ${(compliance * 100).toFixed(0)}% (≥ ${Math.round(thresholds.complianceMin * 100)}%).`,
    `Sin lesión activa.`,
  ];

  if (current.role === 'volume') {
    rationale.push(`TSB ${load.tsb.toFixed(0)} estable.`);
  }

  // When advancing INTO a peak phase, gate on the A-event peaking window.
  if (next.role === 'peak') {
    const days = await aEventDays({ athlete_id: params.athlete_id, today_iso: todayIso, client });
    if (days != null && days > REAL_MAX_A_EVENT_WEEKS * 7) {
      return {
        ready: false,
        current_block: current.label,
        reason: NOT_READY_REASONS.no_a_event_window,
      };
    }
    if (days != null) {
      rationale.push(
        `A-event a ${days} días (≤ ${REAL_MAX_A_EVENT_WEEKS} semanas, entra en pico).`,
      );
    } else {
      rationale.push(`Sin A-event fechado: ${next.label} queda a criterio.`);
    }
  }

  return { ready: true, from: current.label, to: next.label, rationale };
}
