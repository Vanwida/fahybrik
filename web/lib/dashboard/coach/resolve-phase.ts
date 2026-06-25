import type { MethodologyPhase } from '@fahybrid/shared/schema/methodology-phases';
import type { PhaseRole } from '@fahybrid/shared/schema/_primitives';
import type { AtrBlockType } from '@fahybrid/shared/domain/atr/planner';
import {
  ATR_PHASE_LABEL,
  atrBadgeClass,
  atrPhaseLabel,
} from '@/lib/dashboard/constants/atr-phases';
import { roleColor, roleBadgeClass } from '@/lib/dashboard/coach/phase-roles';

// =============================================================================
// PHASE RESOLVER (PURE) — agnostic, per-coach periodization phases (0052).
//
// This module is dependency-light (NO db/server imports — only the client-safe
// `phase-roles` ramp + the legacy ATR constants) so it can be bundled on the
// CLIENT too (the roadmap/macro display components import it). The server-only
// `loadCoachPhases` / `saveCoachPhases` live in `./phases`, which re-exports the
// pieces below for existing server callers.
//
// A coach defines an arbitrary set of methodology_phases (free label/code).
// `resolvePhase` turns a block into a display-ready descriptor. It NEVER fails:
// if the block has no phase_id, or the coach has no phases yet (e.g. before the
// 0052 seed is applied), it falls back to the legacy `type` enum -> the existing
// ATR_PHASE_LABEL / atrBadgeClass. So everything keeps working pre-migration.
// =============================================================================

/** What a phase looks like once resolved, for UI + AI consumption. */
export type ResolvedPhase = {
  /** Athlete/coach-facing display name. */
  label: string;
  /** Agnostic intensity axis (drives the color ramp + AI semantics). */
  role: PhaseRole;
  /** CSS color token (var(...)) — explicit override or derived from role. */
  color: string;
  /** Temporal order within the macrocycle. */
  sequence_order: number;
  /** Deload/recovery flag. */
  is_deload: boolean;
  /** Tailwind chip classes (border/bg/text) for the phase badge. */
  badgeClass: string;
};

// Legacy enum -> agnostic role, for the fallback path (block on the old enum
// with no resolved phase). Mirrors the ATR color ramp in atrBadgeClass.
const LEGACY_TYPE_ROLE: Record<AtrBlockType, PhaseRole> = {
  ACC: 'volume',
  TRANS: 'intensity',
  REAL: 'peak',
};

// Legacy enum -> stable sequence order (ACC=1 -> TRANS=2 -> REAL=3).
const LEGACY_TYPE_ORDER: Record<AtrBlockType, number> = {
  ACC: 1,
  TRANS: 2,
  REAL: 3,
};

/** The minimal block shape the resolver needs (works with AtrBlock or a row). */
type BlockLike = {
  type: AtrBlockType | string;
  phase_id?: number | bigint | string | null;
};

/** Index a coach's phases by id for O(1) lookup inside resolvePhase. */
export function indexPhasesById(
  phases: ReadonlyArray<MethodologyPhase>,
): Map<string, MethodologyPhase> {
  const map = new Map<string, MethodologyPhase>();
  for (const p of phases) map.set(String(p.id), p);
  return map;
}

/**
 * Resolve a block to its display-ready phase descriptor.
 *
 * @param block        the atr_block (needs `type` and optional `phase_id`).
 * @param coachPhases  the coach's methodology_phases (array OR pre-built Map).
 *
 * Fallback order:
 *   1. block.phase_id resolves against coachPhases -> use the coach phase.
 *   2. otherwise -> legacy `type` enum -> ATR_PHASE_LABEL / atrBadgeClass.
 * Returns a valid descriptor for unknown values too (never throws).
 */
export function resolvePhase(
  block: BlockLike,
  coachPhases:
    | ReadonlyArray<MethodologyPhase>
    | ReadonlyMap<string, MethodologyPhase>,
): ResolvedPhase {
  const byId =
    coachPhases instanceof Map
      ? (coachPhases as ReadonlyMap<string, MethodologyPhase>)
      : indexPhasesById(coachPhases as ReadonlyArray<MethodologyPhase>);

  // --- Path 1: coach-defined phase ---
  if (block.phase_id != null) {
    const phase = byId.get(String(block.phase_id));
    if (phase) {
      const role = phase.role as PhaseRole;
      return {
        label: phase.label,
        role,
        // explicit override (phase.color) wins; else the role ramp.
        color: phase.color ?? roleColor(role),
        sequence_order: phase.sequence_order,
        is_deload: phase.is_deload,
        // badge stays role-coded (the explicit color is surfaced via `color`).
        badgeClass: roleBadgeClass(role),
      };
    }
  }

  // --- Path 2: legacy enum fallback (pre-migration / unlinked block) ---
  const legacyKey = block.type as AtrBlockType;
  const role = LEGACY_TYPE_ROLE[legacyKey] ?? 'maintenance';
  return {
    label: ATR_PHASE_LABEL[legacyKey] ?? atrPhaseLabel(String(block.type)),
    role,
    color: roleColor(role),
    sequence_order: LEGACY_TYPE_ORDER[legacyKey] ?? 0,
    is_deload: false,
    badgeClass: atrBadgeClass(typeof block.type === 'string' ? block.type : null),
  };
}
