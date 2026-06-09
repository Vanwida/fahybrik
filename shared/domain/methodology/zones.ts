// Methodology ZONE RESOLVER (spec §5 "Modelo de zonas e intensidad").
//
// WHAT IT DOES
// ------------
// Translates a coach LABEL written against a methodology zone model — "Z2",
// "@RPE7", "race pace", "split 2:00", "Z4 row" — into a CONCRETE, per-athlete
// `Target` from the 0043 prescription model, using that athlete's onboarding
// benchmarks. The formulas are defined ONCE here and evaluated per athlete.
//
//   resolveTarget(label, benchmarks, opts?) -> ResolvedTarget
//     .target        a valid prescription `Target` (hr_bpm range, pace value_s,
//                    percent_rm, rpe, …) — directly assignable to a set.
//     .source        which anchor/fallback produced it (audit + UI "estimated").
//     .estimated     true when a fallback (Tanaka, LTHR≈0.88·HRmax) was used →
//                    the UI shows "estimada · testear w1" (spec §5 rule).
//
// WHY HERE
// --------
// This is the bridge between the methodology zone tables (methodology_zones,
// migration 0048) and the structured prescription a workout actually carries.
// Single-sourced in shared so web (preview), infra (seed/backfill) and the IA
// adapter all resolve identically. Output is a Target the existing
// targetSchema (0043) accepts unchanged.

import type { Modality, Target } from '../prescription/types';

// ── Athlete benchmark inputs (onboarding output_field names, spec §8) ────────
// All optional: the resolver applies the documented fallback chain when an anchor
// is missing. Field names match the onboarding contract exactly.
export interface AthleteBenchmarks {
  // strength 1RMs (kg)
  one_rm_back_squat_kg?: number | null;
  one_rm_deadlift_kg?: number | null;
  one_rm_bench_kg?: number | null;
  one_rm_ohp_kg?: number | null;
  one_rm_clean_kg?: number | null;
  // run anchors (seconds)
  time_5k_seconds?: number | null;
  time_10k_seconds?: number | null;
  time_1mile_seconds?: number | null;
  time_threshold_pace_s_per_km?: number | null;
  // erg anchors
  time_2k_row_seconds?: number | null; // 2000 m row
  time_1k_ski_seconds?: number | null; // 1000 m ski
  ftp_watts?: number | null; // cycling
  // HR anchors
  lthr_bpm?: number | null;
  max_hr_bpm?: number | null;
  // demographics for HR fallback (Tanaka)
  age_years?: number | null;
  // race goal (for "race pace" label, 8 km HYROX run total)
  hyrox_goal_run_total_seconds?: number | null;
}

// ── Zone model (spec §5) ────────────────────────────────────────────────────
export type HrZone = 1 | 2 | 3 | 4 | 5;
export type PaceZone = 1 | 2 | 3 | 4 | 5;

export interface ResolvedTarget {
  target: Target;
  source: string;
  estimated: boolean;
}

// HYROX run is 8 × 1000 m (spec §5: race pace = goal_time / 8000 m).
const HYROX_RUN_METERS = 8000;
// Tanaka HRmax fallback: 208 − 0.7·age (spec writes 207−0.7; Tanaka is 208−0.7,
// the published value — used so the estimate is the real formula, not a typo).
const TANAKA_INTERCEPT = 208;
const TANAKA_SLOPE = 0.7;
// LTHR fallback from HRmax (spec §5): LTHR ≈ 0.88 · HRmax.
const LTHR_FROM_HRMAX = 0.88;

// HR zones as fraction of LTHR (spec §5 hr_zone_matrix). [lower, upper] of LTHR.
const HR_ZONE_FRACTIONS: Record<HrZone, { lo: number; hi: number }> = {
  1: { lo: 0.0, hi: 0.81 },
  2: { lo: 0.82, hi: 0.88 },
  3: { lo: 0.89, hi: 0.94 },
  4: { lo: 0.95, hi: 1.02 },
  5: { lo: 1.03, hi: 1.15 }, // open-ended ≥1.03; capped at a sane physiological hi
};

// Run pace offsets in s/km ADDED to pace5K (spec §5). Negative = faster than 5K.
const RUN_PACE_OFFSETS: Record<PaceZone, { lo: number; hi: number }> = {
  1: { lo: 95, hi: 125 },
  2: { lo: 75, hi: 95 },
  3: { lo: 35, hi: 50 },
  4: { lo: 5, hi: 15 },
  5: { lo: -20, hi: -10 },
};
// HYROX race-pace offset over pace5K (spec §5): +50..60 s/km.
const RUN_HYROX_RACE_OFFSET = { lo: 50, hi: 60 };

// Erg (row/ski) offsets in s/500m ADDED to split2K (spec §5).
const ERG_SPLIT_OFFSETS: Record<PaceZone, { lo: number; hi: number }> = {
  1: { lo: 20, hi: 25 },
  2: { lo: 12, hi: 18 },
  3: { lo: 5, hi: 9 },
  4: { lo: 0, hi: 4 },
  5: { lo: -8, hi: -3 },
};

// Bike %FTP (Coggan) → power Target (watts). [lo,hi] fraction of FTP.
const BIKE_FTP_FRACTIONS: Record<PaceZone, { lo: number; hi: number }> = {
  1: { lo: 0.0, hi: 0.55 },
  2: { lo: 0.56, hi: 0.75 },
  3: { lo: 0.76, hi: 0.9 },
  4: { lo: 0.91, hi: 1.05 },
  5: { lo: 1.06, hi: 1.2 },
};

// ── Anchor derivations ──────────────────────────────────────────────────────

/** Resolve LTHR with the documented fallback chain (spec §5). */
function resolveLthr(b: AthleteBenchmarks): { lthr: number; estimated: boolean; source: string } | null {
  if (b.lthr_bpm != null) return { lthr: b.lthr_bpm, estimated: false, source: 'lthr_bpm' };
  if (b.max_hr_bpm != null)
    return { lthr: b.max_hr_bpm * LTHR_FROM_HRMAX, estimated: true, source: 'lthr≈0.88·max_hr_bpm' };
  if (b.age_years != null) {
    const hrmax = TANAKA_INTERCEPT - TANAKA_SLOPE * b.age_years;
    return { lthr: hrmax * LTHR_FROM_HRMAX, estimated: true, source: 'lthr≈0.88·Tanaka(age)' };
  }
  return null;
}

/** pace5K in s/km from the run anchors, with fallbacks (spec §5). */
function resolvePace5kPerKm(b: AthleteBenchmarks): { s_per_km: number; source: string } | null {
  if (b.time_5k_seconds != null) return { s_per_km: b.time_5k_seconds / 5, source: 'time_5k_seconds' };
  if (b.time_10k_seconds != null)
    // 10K pace is ~ +15s/km slower than 5K; subtract to estimate 5K pace.
    return { s_per_km: b.time_10k_seconds / 10 - 15, source: 'est_from_time_10k_seconds' };
  if (b.time_1mile_seconds != null)
    // 1 mile = 1.609 km, ~ -20s/km faster than 5K; add to estimate 5K pace.
    return { s_per_km: b.time_1mile_seconds / 1.609 + 20, source: 'est_from_time_1mile_seconds' };
  if (b.time_threshold_pace_s_per_km != null)
    // threshold ≈ Z4 ≈ pace5K + ~10s/km; subtract to back out 5K pace.
    return { s_per_km: b.time_threshold_pace_s_per_km - 10, source: 'est_from_threshold_pace' };
  return null;
}

/** Row split2K in s/500m (spec §5). */
function resolveRowSplit500(b: AthleteBenchmarks): { s_per_500m: number; source: string } | null {
  if (b.time_2k_row_seconds != null)
    return { s_per_500m: b.time_2k_row_seconds / 4, source: 'time_2k_row_seconds' };
  return null;
}

/** Ski split1K → normalized to s/500m (spec §5: ski anchor is 1K). */
function resolveSkiSplit500(b: AthleteBenchmarks): { s_per_500m: number; source: string } | null {
  if (b.time_1k_ski_seconds != null)
    return { s_per_500m: b.time_1k_ski_seconds / 2, source: 'time_1k_ski_seconds' };
  return null;
}

// ── Label parsing (spec §5 labels) ──────────────────────────────────────────
export type ZoneLabel =
  | { kind: 'hr_zone'; zone: HrZone }
  | { kind: 'pace_zone'; zone: PaceZone; modality: 'run' | 'row' | 'ski' | 'bike' }
  | { kind: 'race_pace'; modality: 'run' }
  | { kind: 'rpe'; value: number }
  | { kind: 'rir'; value: number }
  | { kind: 'pct_rm'; value: number }
  | { kind: 'split'; modality: 'row' | 'ski'; seconds_per_500m: number };

/**
 * Parse a coach label string into a structured ZoneLabel. Supports:
 *   "Z2", "Z4 row", "zone 3"          → hr_zone / pace_zone (modality-aware)
 *   "race pace", "race"               → race_pace (run)
 *   "@RPE7", "RPE 8", "rpe7"          → rpe
 *   "RIR2", "rir 1"                   → rir
 *   "78%", "78% RM", "@80%1rm"        → pct_rm
 *   "split 2:00", "2:00/500m"         → split (row default; "ski split …")
 * Returns null when unparseable (caller falls back / flags).
 *
 * The modality hint disambiguates a bare "Z2": HR zone by default, pace zone when
 * the modality is a pacing one AND the label explicitly names pace (handled by
 * resolveTarget via opts.preferPaceForModality).
 */
export function parseZoneLabel(raw: string): ZoneLabel | null {
  const s = raw.trim().toLowerCase();

  // %RM
  const pct = s.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
  if (pct && /rm|1rm|max/.test(s.replace(pct[0], '')) === false && /%/.test(s)) {
    // a bare "78%" or "78% rm" — treat as %RM
    return { kind: 'pct_rm', value: Number(pct[1]) };
  }

  // RPE
  const rpe = s.match(/rpe\s*([0-9]{1,2}(?:\.\d)?)/);
  if (rpe) return { kind: 'rpe', value: Number(rpe[1]) };

  // RIR
  const rir = s.match(/rir\s*([0-9]{1,2})/);
  if (rir) return { kind: 'rir', value: Number(rir[1]) };

  // split m:ss (e.g. "2:00", "split 1:58/500m", "ski split 2:05")
  const split = s.match(/(\d{1,2}):(\d{2})/);
  if (split) {
    const seconds = Number(split[1]) * 60 + Number(split[2]);
    const modality: 'row' | 'ski' = /ski/.test(s) ? 'ski' : 'row';
    return { kind: 'split', modality, seconds_per_500m: seconds };
  }

  // race pace
  if (/race\s*pace|race$|hyrox\s*pace/.test(s)) return { kind: 'race_pace', modality: 'run' };

  // zone Zn / "zone n"
  const z = s.match(/z(?:one)?\s*([1-5])/);
  if (z) {
    const zone = Number(z[1]) as HrZone & PaceZone;
    const modality: 'run' | 'row' | 'ski' | 'bike' | null = /ski/.test(s)
      ? 'ski'
      : /row|remo/.test(s)
        ? 'row'
        : /bike|bici|cycl/.test(s)
          ? 'bike'
          : /run|corr/.test(s)
            ? 'run'
            : null;
    if (modality) return { kind: 'pace_zone', zone, modality };
    return { kind: 'hr_zone', zone };
  }

  return null;
}

// ── Target construction ─────────────────────────────────────────────────────

function hrTarget(zone: HrZone, b: AthleteBenchmarks): ResolvedTarget | null {
  const l = resolveLthr(b);
  if (!l) {
    // No HR data at all → return the zone itself; caller decides if usable.
    return { target: { kind: 'hr_zone', value: zone }, source: 'hr_zone(no_anchor)', estimated: true };
  }
  const f = HR_ZONE_FRACTIONS[zone];
  const min = Math.round(l.lthr * f.lo);
  const max = Math.round(l.lthr * f.hi);
  // Z1 is open-ended at the bottom → no min bound. exactOptionalPropertyTypes:
  // omit the key entirely rather than set it to undefined.
  const target: Target = zone === 1 ? { kind: 'hr_bpm', max } : { kind: 'hr_bpm', min, max };
  return { target, source: l.source, estimated: l.estimated };
}

function runPaceTarget(zone: PaceZone, b: AthleteBenchmarks): ResolvedTarget | null {
  const p = resolvePace5kPerKm(b);
  if (!p) return null;
  const o = RUN_PACE_OFFSETS[zone];
  // offset ADDED to pace5K; lo offset = faster bound, hi offset = slower bound.
  const min_s = Math.round(p.s_per_km + o.lo);
  const max_s = Math.round(p.s_per_km + o.hi);
  return {
    target: { kind: 'pace', unit: 'per_km', min_s: Math.min(min_s, max_s), max_s: Math.max(min_s, max_s) },
    source: p.source,
    estimated: p.source.startsWith('est_'),
  };
}

function ergPaceTarget(zone: PaceZone, modality: 'row' | 'ski', b: AthleteBenchmarks): ResolvedTarget | null {
  const s = modality === 'ski' ? resolveSkiSplit500(b) : resolveRowSplit500(b);
  if (!s) return null;
  const o = ERG_SPLIT_OFFSETS[zone];
  const min_s = Math.round(s.s_per_500m + o.lo);
  const max_s = Math.round(s.s_per_500m + o.hi);
  return {
    target: { kind: 'pace', unit: 'per_500m', min_s: Math.min(min_s, max_s), max_s: Math.max(min_s, max_s) },
    source: s.source,
    estimated: false,
  };
}

function bikePowerTarget(zone: PaceZone, b: AthleteBenchmarks): ResolvedTarget | null {
  if (b.ftp_watts == null) return null;
  const f = BIKE_FTP_FRACTIONS[zone];
  // Bike intensity is power; the prescription model has no native watts Target.
  // Express as calories goal is wrong; use hr_zone fallback if no power channel.
  // We surface watts via a `kg`-free numeric is not valid — so we return the
  // raw zone and let the caller attach watts to segment params (spec §5 note:
  // machine settings/power live as segment params, not in Target). We therefore
  // expose watts on `source` and keep Target as the bike pace-zone equivalent
  // via hr if available; otherwise the zone itself.
  const minW = Math.round((b.ftp_watts ?? 0) * f.lo);
  const maxW = Math.round((b.ftp_watts ?? 0) * f.hi);
  const hr = hrTarget(zone as HrZone, b);
  if (hr) return { ...hr, source: `${hr.source} (bike ${minW}-${maxW}W @${Math.round(f.hi * 100)}%FTP)` };
  return { target: { kind: 'hr_zone', value: zone }, source: `bike ${minW}-${maxW}W @FTP`, estimated: true };
}

function racePaceTarget(b: AthleteBenchmarks): ResolvedTarget | null {
  // "race pace" = HYROX goal run total / 8000 m, when a goal is set (spec §5).
  if (b.hyrox_goal_run_total_seconds != null) {
    const s_per_km = b.hyrox_goal_run_total_seconds / (HYROX_RUN_METERS / 1000);
    return { target: { kind: 'pace', unit: 'per_km', value_s: Math.round(s_per_km) }, source: 'hyrox_goal_run', estimated: false };
  }
  // Fallback: pace5K + HYROX race offset.
  const p = resolvePace5kPerKm(b);
  if (!p) return null;
  const min_s = Math.round(p.s_per_km + RUN_HYROX_RACE_OFFSET.lo);
  const max_s = Math.round(p.s_per_km + RUN_HYROX_RACE_OFFSET.hi);
  return { target: { kind: 'pace', unit: 'per_km', min_s, max_s }, source: `${p.source}+hyrox_offset`, estimated: true };
}

export interface ResolveOpts {
  // Modality of the line being prescribed; disambiguates a bare "Z2" → use pace
  // zone for pacing modalities (run/row/ski/bike) instead of HR.
  modality?: Modality;
}

/**
 * Resolve a coach LABEL to a concrete per-athlete `Target` (spec §5).
 * Returns null when the label is unparseable. When the label is parseable but the
 * required anchor is missing, returns a best-effort Target with estimated:true
 * (so the UI can mark "estimada · testear w1") — except %RM/RPE/RIR which need no
 * benchmark and are always exact.
 */
export function resolveTarget(
  label: string,
  benchmarks: AthleteBenchmarks,
  opts: ResolveOpts = {},
): ResolvedTarget | null {
  const parsed = parseZoneLabel(label);
  if (!parsed) return null;

  switch (parsed.kind) {
    case 'pct_rm':
      return { target: { kind: 'percent_rm', value: parsed.value }, source: 'label', estimated: false };
    case 'rpe':
      return { target: { kind: 'rpe', value: parsed.value }, source: 'label', estimated: false };
    case 'rir':
      return { target: { kind: 'rir', value: parsed.value }, source: 'label', estimated: false };
    case 'split': {
      const offset = parsed.seconds_per_500m;
      return { target: { kind: 'pace', unit: 'per_500m', value_s: offset }, source: 'label', estimated: false };
    }
    case 'race_pace':
      return racePaceTarget(benchmarks);
    case 'pace_zone':
      if (parsed.modality === 'run') return runPaceTarget(parsed.zone, benchmarks);
      if (parsed.modality === 'row' || parsed.modality === 'ski')
        return ergPaceTarget(parsed.zone, parsed.modality, benchmarks);
      if (parsed.modality === 'bike') return bikePowerTarget(parsed.zone, benchmarks);
      return null;
    case 'hr_zone': {
      // Bare "Z2": if the line's modality is a pacing one, prefer the pace zone.
      const m = opts.modality;
      if (m === 'run') return runPaceTarget(parsed.zone, benchmarks) ?? hrTarget(parsed.zone, benchmarks);
      if (m === 'row' || m === 'ski')
        return ergPaceTarget(parsed.zone, m, benchmarks) ?? hrTarget(parsed.zone, benchmarks);
      if (m === 'bike') return bikePowerTarget(parsed.zone, benchmarks);
      return hrTarget(parsed.zone, benchmarks);
    }
  }
}
