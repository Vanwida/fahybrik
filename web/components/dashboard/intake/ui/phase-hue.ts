// Muted methodology hue per ATR block type for the intake structure timeline.
// Reuses the canonical dashboard phase ramp (atr-phases / phase-roles): ACC =
// volume (green), TRANS = intensity (amber), REAL = peak (red). NEVER orange —
// orange is brand/selection only. Returns a CSS color token (var(...)) so the
// caller mixes the tint inline; no hex literals anywhere.
//
// This mirrors the legacy ATR ramp already used by atrBadgeClass across the
// board, so the timeline reads the same as every other phase badge.

import type { AtrBlockType } from '@/lib/dashboard/constants/atr-phases';

const PHASE_HUE: Record<string, string> = {
  ACC: 'var(--ok)',
  TRANS: 'var(--warning)',
  REAL: 'var(--danger)',
};

/** CSS color token for a block type's phase hue (muted ramp, never orange). */
export function phaseHue(type: AtrBlockType | string): string {
  return PHASE_HUE[type] ?? 'var(--text-muted)';
}
