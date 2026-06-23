// v2 · PHASE ROLE PRESENTATION on v2 tokens.
//
// The agnostic `role` axis, its labels, hints and the ATR seed are the SINGLE
// SOURCE OF TRUTH in @/lib/dashboard/coach/phase-roles (shared with the v1 server
// resolver). We re-use all of that here. The ONLY thing this module adds is the
// role -> v2 design-token color, because phase-roles.ts maps onto v1 globals.css
// tokens (--status-success, --danger, …) while the v2 surface reads the scoped
// --v2-* tokens. Same green->amber->red->blue->neutral ramp, different token set
// (exactly the mapping shown in the approved UX pass).

import type { PhaseRole } from '@fahybrid/shared/schema/_primitives';
import { PHASE_ROLES, ROLE_LABEL, ROLE_HINT, ATR_PHASE_SEED } from '@/lib/dashboard/coach/phase-roles';

// Re-export the agnostic role data so callers import from one place.
export { PHASE_ROLES, ROLE_LABEL, ROLE_HINT, ATR_PHASE_SEED };
export type { PhaseRole };

/** Bare v2 color token per role (the green -> amber -> red ramp). */
const ROLE_V2_COLOR: Record<PhaseRole, string> = {
  volume: 'var(--v2-ok)', // base / high volume -> green
  intensity: 'var(--v2-warn)', // specific intensity -> amber
  peak: 'var(--v2-danger)', // peaking / competition -> red
  recovery: 'var(--v2-info)', // deload / recovery -> blue
  maintenance: 'var(--v2-muted)', // maintenance / neutral
};

/** Soft (tinted) v2 background token per role, for chip fills. */
const ROLE_V2_SOFT: Record<PhaseRole, string> = {
  volume: 'var(--v2-ok-soft)',
  intensity: 'var(--v2-warn-soft)',
  peak: 'var(--v2-danger-soft)',
  recovery: 'var(--v2-info-soft)',
  maintenance: 'var(--v2-surface-2)',
};

export function roleV2Color(role: PhaseRole): string {
  return ROLE_V2_COLOR[role] ?? ROLE_V2_COLOR.maintenance;
}

export function roleV2Soft(role: PhaseRole): string {
  return ROLE_V2_SOFT[role] ?? ROLE_V2_SOFT.maintenance;
}
