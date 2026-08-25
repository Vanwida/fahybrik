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
  BENCH_LTHR,
  BENCH_RUN_THRESHOLD,
  BENCH_ROW_THRESHOLD,
  BENCH_SKI_THRESHOLD,
  BENCH_RUN_1MILE,
  BENCH_FTP,
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
 * Map `athlete_benchmarks` rows (slug + value) onto the `AthleteBenchmarks` shape
 * the threshold resolvers read. Missing slugs stay null; 1RMs are omitted (they
 * produce no zone).
 *
 * THIS FUNCTION WAS THE BUG, THREE TIMES OVER. It mapped only the time-trial
 * anchors, so every ladder's TOP rung was unreachable while the resolvers sat
 * there already preferring it:
 *
 *   · `run_threshold_s_per_km`      — `resolveRunThresholdPerKm` prefers it and
 *     marks it measured, but it never arrived, so a measured threshold lost to a
 *     5K time + a 10 s/km offset.
 *   · `row/ski_threshold_s_per_500m`— the field did not even exist, so a measured
 *     erg threshold had nowhere to land at all.
 *   · `lthr_bpm`                    — the wrist kept getting age-estimated zones
 *     for an athlete who had measured his threshold.
 *
 * Athlete 66 in production held measured run (248 s/km) and row (114 s/500m)
 * thresholds and had ZERO zones of any kind, because the numbers stopped here.
 *
 * A benchmark row is a MEASUREMENT, whoever recorded it; the confidence of each
 * rung is decided by the resolvers, not by this mapper.
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
    time_1mile_seconds: get(BENCH_RUN_1MILE),
    time_2k_row_seconds: get(BENCH_ROW_2K),
    time_1k_ski_seconds: get(BENCH_SKI_1K),
    // The measured threshold of each ladder — the rungs that were stranded.
    time_threshold_pace_s_per_km: get(BENCH_RUN_THRESHOLD),
    time_threshold_row_s_per_500m: get(BENCH_ROW_THRESHOLD),
    time_threshold_ski_s_per_500m: get(BENCH_SKI_THRESHOLD),
    lthr_bpm: get(BENCH_LTHR),
    ftp_watts: get(BENCH_FTP),
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

// ── El número que se PUEDE servir (card 104) ─────────────────────────────────
//
// `deriveModalityThresholds` sigue pudiendo ESTIMAR un umbral desde un 5 km
// (el alta necesita bandas para pintar). Eso no es el número del atleta.
// Quien enseña o manda un ritmo de umbral (analíticas, capacidad, card 130)
// pasa por aquí: perfil de un TEST, o la marca `run_threshold_*` ya guardada.
// Un perfil `onboarding_auto` y un 5 km + 10 s/km no cuentan.

/** Un perfil nació de un test (coach o atleta) y nadie lo ha dejado en revisión. */
export function isMeasuredZoneProfile(
  source: string | null | undefined,
  needsReview?: boolean | null,
): boolean {
  return (source === 'coach_test' || source === 'athlete_test') && needsReview !== true;
}

/**
 * El umbral que el resto del producto ya usa: el snapshot medido del plan, y
 * si ese no existe, la marca de umbral ya guardada para ESE atleta. No inventa.
 * No es un segundo calculador: elige entre las dos fuentes que ya existen.
 */
export function measuredThresholdSeconds(args: {
  profile: { threshold_s: number; source: string | null; needs_review?: boolean | null } | null;
  thresholdMarkS: number | null;
}): number | null {
  const profile = args.profile;
  if (
    profile &&
    isMeasuredZoneProfile(profile.source, profile.needs_review) &&
    Number.isFinite(profile.threshold_s) &&
    profile.threshold_s > 0
  ) {
    return profile.threshold_s;
  }
  const mark = args.thresholdMarkS;
  if (mark != null && Number.isFinite(mark) && mark > 0) return mark;
  return null;
}

/** Vacío: el coach no escribió el test. */
export function thresholdUnknownNote(_testLabel?: string | null): string {
  return '';
}
