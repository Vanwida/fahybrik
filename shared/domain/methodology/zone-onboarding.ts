// ONBOARDING BENCHMARKS → AUTO ZONE PROFILES — the pure connection (no I/O).
//
// WHAT THIS IS
// ------------
// The athlete enters benchmark times in onboarding (a 5K run, a 2K row split, a
// 1K ski split …). Those already feed the LEVEL suggestion; this module is their
// missing twin — it derives the athlete's per-modality ZONE profiles from the
// SAME benchmarks, so the coach no longer has to re-register a test by hand for
// zones to exist.
//
// It composes the EXISTING resolvers, inventing no new math:
//   benchmarks → `deriveModalityThresholds` (zones.ts) → one threshold per
//   modality the athlete actually tested → `resolveZonesForAthlete` (zone-model.ts)
//   against the coach's offset bands → the 6 absolute bands per modality.
//
// HONEST: a modality with no benchmark produces NO zone (it's simply absent). A
// modality whose coach model is incomplete (≠6 bands) or malformed is skipped
// without throwing — the rest still resolve.

import {
  resolveZonesForAthlete,
  type CoachZone,
  type ResolvedZone,
  type ZonePaceUnit,
} from './zone-model';
import {
  deriveModalityThresholds,
  type AthleteBenchmarks,
} from './zones';
import {
  BENCH_RUN_5K,
  BENCH_RUN_10K,
  BENCH_ROW_2K,
  BENCH_SKI_1K,
} from '../coach/benchmark-slugs';

/** A zone profile derived from onboarding benchmarks (the resolver's output). */
export interface DerivedZoneProfile {
  modality: 'run' | 'row' | 'ski';
  /** Threshold pace (seconds per `pace_unit`) the bands were resolved from. */
  threshold_s: number;
  pace_unit: ZonePaceUnit;
  /** The 6 absolute bands, ready to snapshot into athlete_zone_profiles. */
  zones: ResolvedZone[];
  /** Audit: which benchmark anchor produced the threshold. */
  source: string;
  /** True when the threshold was estimated (e.g. run threshold from 5K pace). */
  estimated: boolean;
}

/** The coach's offset bands, split by the unit each modality family uses. */
export interface CoachZonesByUnit {
  per_500m: CoachZone[]; // ergo (row/ski)
  per_km: CoachZone[]; // run
}

const ZONE_COUNT = 6;

/**
 * Map `athlete_benchmarks` rows (slug + value) onto the `AthleteBenchmarks`
 * shape the threshold resolvers read. Only the pacing anchors used for zones are
 * mapped (1RMs etc. don't produce pace zones). Missing slugs stay null.
 */
export function athleteBenchmarksFromSlugRows(
  rows: Array<{ exercise_slug: string; value: number | null }>,
): AthleteBenchmarks {
  const get = (slug: string): number | null => {
    const r = rows.find((x) => x.exercise_slug === slug);
    return r && typeof r.value === 'number' && Number.isFinite(r.value) ? r.value : null;
  };
  return {
    time_5k_seconds: get(BENCH_RUN_5K),
    time_10k_seconds: get(BENCH_RUN_10K),
    time_2k_row_seconds: get(BENCH_ROW_2K),
    time_1k_ski_seconds: get(BENCH_SKI_1K),
  };
}

/**
 * Derive the per-modality zone profiles from an athlete's benchmarks and the
 * coach's offset bands. Returns one entry per modality the athlete has a usable
 * benchmark for AND the coach has a complete (6-band) model for. Pure: composes
 * `deriveModalityThresholds` + `resolveZonesForAthlete`; never throws (a bad
 * per-unit model is skipped, not fatal).
 */
export function deriveZoneProfilesFromBenchmarks(
  benchmarks: AthleteBenchmarks,
  coachZones: CoachZonesByUnit,
): DerivedZoneProfile[] {
  const out: DerivedZoneProfile[] = [];
  for (const t of deriveModalityThresholds(benchmarks)) {
    const bands = t.pace_unit === 'per_km' ? coachZones.per_km : coachZones.per_500m;
    // Honest skip: an incomplete coach model can't resolve 6 bands.
    if (bands.length !== ZONE_COUNT) continue;
    try {
      const zones = resolveZonesForAthlete(
        { modality: t.modality, threshold_s: t.threshold_s, pace_unit: t.pace_unit },
        bands,
      );
      out.push({
        modality: t.modality,
        threshold_s: t.threshold_s,
        pace_unit: t.pace_unit,
        zones,
        source: t.source,
        estimated: t.estimated,
      });
    } catch {
      // Malformed model for this unit (e.g. negative resolved pace) → skip this
      // modality, keep the others. No fabricated zone, no crash.
    }
  }
  return out;
}
