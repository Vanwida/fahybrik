// SIX-ZONE PACE MODEL — the pure domain for the Test feature (migration 0061).
//
// WHAT THIS IS
// ------------
// A test produces a THRESHOLD pace (the athlete's Z4 lower bound) for a modality.
// Every training zone is then a fixed OFFSET band from that threshold. The bands
// are a coach's methodology DATA (seeded standard, editable — methodology_zones,
// 0061), NOT logic hardcoded here. This module is the single, pure place that:
//
//   resolveZonesForAthlete(testResult, coachZones) -> ResolvedZone[6]
//     applies the coach's offset bands to one athlete's test pace, producing the
//     six ABSOLUTE pace ranges (seconds per unit). Deterministic, no I/O.
//
// The output of this resolver is what gets SNAPSHOTTED into athlete_zone_profiles
// (the single stored source the plan resolver + calculator read), so zones are
// computed ONCE and never recomputed divergently — the bug this feature prevents.
//
// AGNOSTIC: the zone identities/labels/colors and the offset numbers all come in
// as `coachZones` (rows of methodology_zones). This file holds only the MATH that
// turns an offset band + a threshold into an absolute band — nothing coach-specific.

// ── The intensity role axis (mirrors methodology_zones.role CHECK) ───────────
// Closed set: the semantic tier the IA reasons on + the generic color ramp. The
// only constrained dimension; labels/colors/offsets are free coach data.
export const ZONE_ROLES = [
  'recovery',
  'aerobic_base',
  'aerobic_threshold',
  'threshold',
  'vo2max',
  'sprint',
] as const;
export type ZoneRole = (typeof ZONE_ROLES)[number];

// ── Pace unit (mirrors methodology_zones.pace_unit + athlete_zone_profiles) ──
// per_500m for ergo (row/ski/bike-erg); per_km for run. A coach's zone SET is one
// unit; an athlete's threshold is in the same unit.
export type ZonePaceUnit = 'per_500m' | 'per_km';

// ── A coach zone definition (one methodology_zones row, the offset band) ─────
export interface CoachZone {
  code: string; // 'Z1'..'Z6'
  label: string;
  color: string;
  role: ZoneRole;
  sort_order: number; // 1 (easiest) … 6 (hardest)
  pace_unit: ZonePaceUnit;
  /** Fast edge of the band: seconds from threshold (negative = faster). */
  low_offset_s: number;
  /** Slow edge: seconds from threshold. null = open-ended (Z1 = +infinity). */
  high_offset_s: number | null;
}

// ── A test result (the input to the resolver) ───────────────────────────────
export interface ZoneTestResult {
  /** Modality the test was performed in: row | ski | run | bike. */
  modality: 'row' | 'ski' | 'run' | 'bike';
  /** Threshold pace = the test result = the Z4 lower bound, in `pace_unit`. */
  threshold_s: number;
  /** Unit of `threshold_s` (must match the coach zones' pace_unit). */
  pace_unit: ZonePaceUnit;
}

// ── A resolved absolute zone band (the output, snapshotted to the profile) ───
export interface ResolvedZone {
  code: string;
  label: string;
  color: string;
  role: ZoneRole;
  sort_order: number;
  /** Absolute FAST bound of the band, seconds per unit (smaller = faster). */
  fast_s: number;
  /** Absolute SLOW bound, seconds per unit. null = open-ended (Z1 = +infinity). */
  slow_s: number | null;
}

const ZONE_COUNT = 6;

/**
 * Resolve a coach's offset-band zone model against one athlete's test result.
 *
 *   absolute fast bound = threshold + low_offset_s
 *   absolute slow bound = threshold + high_offset_s   (null => open / +infinity)
 *
 * Returns the six absolute bands ordered easiest→hardest (sort_order asc). Throws
 * on a malformed model (not 6 zones for the unit, mismatched unit, negative
 * absolute pace) — callers validate inputs first; this stays pure + strict so a
 * bad model surfaces loudly rather than producing silent garbage zones.
 */
export function resolveZonesForAthlete(testResult: ZoneTestResult, coachZones: CoachZone[]): ResolvedZone[] {
  const { threshold_s, pace_unit } = testResult;
  if (!(threshold_s > 0)) {
    throw new Error(`resolveZonesForAthlete: threshold_s must be > 0 (got ${threshold_s})`);
  }

  const zones = coachZones
    .filter((z) => z.pace_unit === pace_unit)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);

  if (zones.length !== ZONE_COUNT) {
    throw new Error(
      `resolveZonesForAthlete: expected ${ZONE_COUNT} zones for pace_unit=${pace_unit}, got ${zones.length}`,
    );
  }

  return zones.map((z) => {
    const fast_s = round2(threshold_s + z.low_offset_s);
    const slow_s = z.high_offset_s === null ? null : round2(threshold_s + z.high_offset_s);
    if (fast_s < 0 || (slow_s !== null && slow_s < 0)) {
      throw new Error(`resolveZonesForAthlete: zone ${z.code} resolved to a negative pace (threshold too low)`);
    }
    return {
      code: z.code,
      label: z.label,
      color: z.color,
      role: z.role,
      sort_order: z.sort_order,
      fast_s,
      slow_s,
    };
  });
}

/**
 * Find one resolved zone by code (e.g. 'Z4') in a resolved set. Returns null when
 * the code isn't present. Case-insensitive on the code.
 */
export function findResolvedZone(zones: ResolvedZone[], code: string): ResolvedZone | null {
  const target = code.trim().toLowerCase();
  return zones.find((z) => z.code.toLowerCase() === target) ?? null;
}

// Round to 2 decimals so stored/compared paces don't carry float noise. Seeded
// offsets are integers, so the standard model yields whole-second bounds.
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
