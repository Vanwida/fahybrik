// Per-SEGMENT intensity resolution for the structured running workout (#61).
//
// A RunStructure segment carries a `SegmentTarget` (pace | pace_zone | hr_zone |
// rpe). This turns ONE segment target into a concrete per-athlete `ResolvedTarget`
// by REUSING the existing zone machinery (`resolveTarget`) — it does NOT duplicate
// any of the offset-band / LTHR maths:
//   · pace      → already absolute (per km); passed through.
//   · rpe       → a perceived effort; concrete without a benchmark.
//   · pace_zone → resolveTarget("Z{n}", …, {modality:'run'}) → per-km pace band.
//   · hr_zone   → resolveTarget("Z{n}", …) with NO modality hint → HR bpm band.
//
// The web athlete wire (assignment-detail) and iOS will call this per segment when
// they render/execute a structure; that integration lives in the athlete layer.

import type { Target } from '../prescription/types';
import type { SegmentTarget } from '../prescription/run-structure';
import type { CoachZone } from './zone-model';
import { resolveTarget, type AthleteBenchmarks, type ResolvedTarget } from './zones';

export interface ResolveSegmentOpts {
  /** The coach's methodology_zones rows (0061). Forwarded to resolveTarget. */
  coachZones?: CoachZone[];
}

/**
 * Resolve one segment target to a concrete per-athlete `ResolvedTarget`, or null
 * when there's no target OR the athlete lacks the benchmark a zone needs (the UI
 * then shows the zone label unresolved — never a fabricated band).
 */
export function resolveSegmentTarget(
  target: SegmentTarget | null,
  benchmarks: AthleteBenchmarks,
  opts: ResolveSegmentOpts = {},
): ResolvedTarget | null {
  if (!target) return null;
  switch (target.type) {
    case 'pace': {
      const t: Target = { kind: 'pace', unit: 'per_km' };
      if (target.value_s !== undefined) t.value_s = target.value_s;
      if (target.min_s !== undefined) t.min_s = target.min_s;
      if (target.max_s !== undefined) t.max_s = target.max_s;
      return { target: t, source: 'segment', estimated: false };
    }
    case 'rpe': {
      const t: Target = { kind: 'rpe' };
      if (target.value !== undefined) t.value = target.value;
      if (target.min !== undefined) t.min = target.min;
      if (target.max !== undefined) t.max = target.max;
      return { target: t, source: 'segment', estimated: false };
    }
    case 'pace_zone':
      return resolveTarget(`Z${target.zone}`, benchmarks, {
        modality: 'run',
        ...(opts.coachZones ? { coachZones: opts.coachZones } : {}),
      });
    case 'hr_zone':
      // No modality hint → resolveTarget takes the HR path (bpm band from LTHR).
      return resolveTarget(`Z${target.zone}`, benchmarks, {
        ...(opts.coachZones ? { coachZones: opts.coachZones } : {}),
      });
  }
}
