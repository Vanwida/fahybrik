// Polar sport name → canonical Modality.
//
// Mirrors lib/garmin/lap-mapping.ts `garminActivityToModality`: it turns a
// provider's free-vocabulary activity label into the ONE canonical
// @fahybrid/shared `Modality` the whole system groups by (run vs row vs ski vs
// bike vs strength …), so a Polar-sourced session lands in the same run-vs-row
// analytics as a Garmin one. In v4 the caller resolves a session's opaque sport
// id to a name via the /sports/list catalogue and passes it here (with the
// parent-sport name as a fallback — Polar groups e.g. road-cycling under cycling).
//
// WHY KEYWORD MATCHING (not a closed enum map like Garmin's): Polar's sport
// catalogue is large and evolving (RUNNING, ROAD_RUNNING, TREADMILL_RUNNING,
// INDOOR_CYCLING, MOUNTAIN_BIKING, INDOOR_ROWING, STRENGTH_TRAINING,
// FUNCTIONAL_TRAINING, …). Enumerating every value would rot on the next Polar
// addition. The physical discipline is carried by a stable substring (RUN / ROW /
// CYCL|BIK / SKI_ERG / STRENGTH / …), so we match on that and fall through to
// `null` for anything we can't classify — exactly Garmin's "unknown → null so
// analytics fall back to the exercise" rule.

import type { Modality } from '@fahybrid/shared/domain/prescription';

// Ordered substring → modality rules. First match wins. Order matters only where
// one token could contain another; the current tokens are disjoint.
const KEYWORD_RULES: ReadonlyArray<readonly [RegExp, Modality]> = [
  [/RUN|JOG/, 'run'],
  [/ROW/, 'row'],
  // Ski-erg only. Polar's snow-skiing sports (CROSS_COUNTRY_SKIING, DOWNHILL…)
  // are NOT the HYROX ski-erg, so we require the explicit ERG token.
  [/SKI[_-]?ERG|SKIERG/, 'ski'],
  [/CYCL|BIKING|\bBIKE\b/, 'bike'],
  [/STRENGTH|WEIGHT_?TRAINING/, 'strength'],
  [/FUNCTIONAL|HIIT|CROSS[_-]?TRAINING|CIRCUIT|BOOTCAMP/, 'functional'],
  [/CORE/, 'core'],
  [/YOGA|PILATES|MOBILITY|STRETCH/, 'mobility'],
];

/**
 * Map Polar sport names to a canonical Modality, or `null` when we cannot
 * classify it (caller then stores no modality, like Garmin). Pass the sport's own
 * name and, optionally, its parent-sport name as a fallback; either may be missing.
 */
export function polarSportToModality(
  sportName: string | null | undefined,
  parentSportName: string | null | undefined,
): Modality | null {
  const haystack = `${sportName ?? ''} ${parentSportName ?? ''}`.toUpperCase();
  if (haystack.trim().length === 0) return null;
  for (const [pattern, modality] of KEYWORD_RULES) {
    if (pattern.test(haystack)) return modality;
  }
  return null;
}
