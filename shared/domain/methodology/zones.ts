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
// This is the bridge between the methodology zone tables (methodology_zones, the
// 6-zone OFFSET model — migration 0061) and the structured prescription a workout
// actually carries. The pace-zone bands are single-sourced in zone-model.ts (the
// SAME offsets the migration seeds and resolveZonesForAthlete applies), so the
// label path here and the test/profile path never diverge. Single-sourced in
// shared so web (preview), infra (seed/backfill) and the IA adapter all resolve
// identically. Output is a Target the existing targetSchema (0043) accepts.

import type { Modality, Target } from '../prescription/types';
import { hrBandFor, resolveHrZones, type HrZone } from './hr-zones';
import {
  resolveZonesForAthlete,
  findResolvedZone,
  type CoachZone,
  type ResolvedZone,
  type ZonePaceUnit,
} from './zone-model';

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
  // MEASURED erg threshold splits (s/500m) — the direct test result, which
  // outranks backing a threshold out of a 2K/1K time trial. Until these existed
  // the erg ladder had a single rung and a measured threshold had nowhere to land.
  time_threshold_row_s_per_500m?: number | null;
  time_threshold_ski_s_per_500m?: number | null;
  ftp_watts?: number | null; // cycling
  // HR anchors
  lthr_bpm?: number | null;
  max_hr_bpm?: number | null;
  // demographics for HR fallback (Tanaka)
  age_years?: number | null;
  // race goal (for "race pace" label, 8 km HYROX run total)
  hyrox_goal_run_total_seconds?: number | null;
}

// ── Zone model (spec §5; pace zones extended to 6 — migration 0061) ──────────
// HR zones are the 5-zone %LTHR model, single-sourced in `hr-zones.ts` (the SAME
// bands the athlete's phone and the coach's analytics paint — see that file's
// header for why there is exactly one). PACE zones are the 6-zone OFFSET model:
// every pace zone is an offset band in seconds from the threshold (test) pace,
// single-sourced as methodology_zones rows. Z6 = Sprint / máxima potencia.
export type { HrZone };
export type PaceZone = 1 | 2 | 3 | 4 | 5 | 6;

export interface ResolvedTarget {
  target: Target;
  source: string;
  estimated: boolean;
}

// HYROX run is 8 × 1000 m (spec §5: race pace = goal_time / 8000 m).
const HYROX_RUN_METERS = 8000;

// The HR anchor chain (measured LTHR → 0.88·max → 0.88·Tanaka) and the zone
// fractions live in `hr-zones.ts`. They are NOT duplicated here: this module
// resolves a coach LABEL, and for the HR axis that means asking the one model.

// ── Standard 6-zone offset bands (the SEEDED default — migration 0061) ───────
// These are the SAME numbers migration 0061 seeds into methodology_zones, kept
// here as the in-code default so the label resolver (resolveTarget) and the test
// resolver (resolveZonesForAthlete) apply ONE source of offsets when no coach
// rows are passed. A caller WITH the coach's methodology_zones should pass them
// in (resolveTarget opts.coachZones) so per-coach edits win. The anchor is the
// THRESHOLD (the Z4 lower bound = test result), not pace5K/split2K — a test
// produces the threshold directly. The per_500m bands are verified.
export const STANDARD_ZONES_PER_500M: readonly CoachZone[] = [
  { code: 'Z1', label: 'Recuperación activa', color: '#22C55E', role: 'recovery', sort_order: 1, pace_unit: 'per_500m', low_offset_s: 22, high_offset_s: null },
  { code: 'Z2', label: 'Aeróbico extensivo', color: '#3B82F6', role: 'aerobic_base', sort_order: 2, pace_unit: 'per_500m', low_offset_s: 14, high_offset_s: 21 },
  { code: 'Z3', label: 'Aeróbico intensivo', color: '#F59E0B', role: 'aerobic_threshold', sort_order: 3, pace_unit: 'per_500m', low_offset_s: 8, high_offset_s: 13 },
  { code: 'Z4', label: 'Umbral anaeróbico', color: '#EF4444', role: 'threshold', sort_order: 4, pace_unit: 'per_500m', low_offset_s: 0, high_offset_s: 7 },
  { code: 'Z5', label: 'VO2max / Potencia', color: '#991B1B', role: 'vo2max', sort_order: 5, pace_unit: 'per_500m', low_offset_s: -3, high_offset_s: -1 },
  { code: 'Z6', label: 'Sprint / Potencia máxima', color: '#111827', role: 'sprint', sort_order: 6, pace_unit: 'per_500m', low_offset_s: -7, high_offset_s: -4 },
] as const;

export const STANDARD_ZONES_PER_KM: readonly CoachZone[] = [
  { code: 'Z1', label: 'Recuperación activa', color: '#22C55E', role: 'recovery', sort_order: 1, pace_unit: 'per_km', low_offset_s: 44, high_offset_s: null },
  { code: 'Z2', label: 'Aeróbico extensivo', color: '#3B82F6', role: 'aerobic_base', sort_order: 2, pace_unit: 'per_km', low_offset_s: 28, high_offset_s: 42 },
  { code: 'Z3', label: 'Aeróbico intensivo', color: '#F59E0B', role: 'aerobic_threshold', sort_order: 3, pace_unit: 'per_km', low_offset_s: 16, high_offset_s: 26 },
  { code: 'Z4', label: 'Umbral anaeróbico', color: '#EF4444', role: 'threshold', sort_order: 4, pace_unit: 'per_km', low_offset_s: 0, high_offset_s: 14 },
  { code: 'Z5', label: 'VO2max / Potencia', color: '#991B1B', role: 'vo2max', sort_order: 5, pace_unit: 'per_km', low_offset_s: -6, high_offset_s: -2 },
  { code: 'Z6', label: 'Sprint / Potencia máxima', color: '#111827', role: 'sprint', sort_order: 6, pace_unit: 'per_km', low_offset_s: -14, high_offset_s: -8 },
] as const;

/** The standard zone set for a pace unit (per_500m ergo | per_km run). */
export function standardZonesFor(unit: ZonePaceUnit): readonly CoachZone[] {
  return unit === 'per_km' ? STANDARD_ZONES_PER_KM : STANDARD_ZONES_PER_500M;
}

// HYROX race-pace offset over pace5K (spec §5): +50..60 s/km.
const RUN_HYROX_RACE_OFFSET = { lo: 50, hi: 60 };

// Bike %FTP (Coggan) → power Target (watts). [lo,hi] fraction of FTP. Bike power
// is a fraction-of-FTP model (orthogonal to the pace offset bands), so it keeps
// its own 6-zone table; Z6 is the supramaximal/neuromuscular sprint band.
const BIKE_FTP_FRACTIONS: Record<PaceZone, { lo: number; hi: number }> = {
  1: { lo: 0.0, hi: 0.55 },
  2: { lo: 0.56, hi: 0.75 },
  3: { lo: 0.76, hi: 0.9 },
  4: { lo: 0.91, hi: 1.05 },
  5: { lo: 1.06, hi: 1.2 },
  6: { lo: 1.21, hi: 1.5 },
};

// HR zones extend to 6 only for label completeness; the %LTHR model is 5-zone,
// so Z6 reuses the Z5 ceiling band (an HR target can't distinguish VO2max from
// neuromuscular sprint — that distinction is a pace/power one). Callers prescribing
// a true sprint use pace/power, not HR.
const HR_ZONE_Z6_FALLBACK: HrZone = 5;

// ── Anchor derivations ──────────────────────────────────────────────────────

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

/**
 * Row THRESHOLD split in s/500m. Prefers the DIRECT threshold test; falls back to
 * the 2K time trial's average split.
 *
 * The fallback is an ESTIMATE and now says so. It used to be reported as measured,
 * which was the erg ladder's version of the same lie the HR ladder told with
 * Tanaka: a 2K is a ~7-minute effort held ABOVE threshold, so its average split is
 * not the threshold — it is a proxy for it.
 */
function resolveRowSplit500(
  b: AthleteBenchmarks,
): { s_per_500m: number; source: string; estimated: boolean } | null {
  if (b.time_threshold_row_s_per_500m != null)
    return {
      s_per_500m: b.time_threshold_row_s_per_500m,
      source: 'time_threshold_row_s_per_500m',
      estimated: false,
    };
  if (b.time_2k_row_seconds != null)
    return { s_per_500m: b.time_2k_row_seconds / 4, source: 'time_2k_row_seconds', estimated: true };
  return null;
}

/** Ski THRESHOLD split in s/500m. Same two rungs as row (ski TT anchor is 1K). */
function resolveSkiSplit500(
  b: AthleteBenchmarks,
): { s_per_500m: number; source: string; estimated: boolean } | null {
  if (b.time_threshold_ski_s_per_500m != null)
    return {
      s_per_500m: b.time_threshold_ski_s_per_500m,
      source: 'time_threshold_ski_s_per_500m',
      estimated: false,
    };
  if (b.time_1k_ski_seconds != null)
    return { s_per_500m: b.time_1k_ski_seconds / 2, source: 'time_1k_ski_seconds', estimated: true };
  return null;
}

// ── THRESHOLD anchors (the Z4 lower bound = the test result) ─────────────────
// The 6-zone OFFSET model (0061) measures every band from the THRESHOLD pace. A
// test produces that threshold directly. These resolvers derive it per modality
// from the athlete's benchmarks, with the documented fallbacks.

/** s/km from the 5K pace; threshold ≈ 5K pace + ~10 s/km (existing spec comment). */
const RUN_THRESHOLD_OVER_5K_S = 10;

/** Run THRESHOLD pace in s/km (the test result). Prefers a direct threshold test. */
function resolveRunThresholdPerKm(b: AthleteBenchmarks): { s_per_km: number; source: string; estimated: boolean } | null {
  if (b.time_threshold_pace_s_per_km != null)
    return { s_per_km: b.time_threshold_pace_s_per_km, source: 'time_threshold_pace_s_per_km', estimated: false };
  const p = resolvePace5kPerKm(b);
  if (!p) return null;
  // threshold ≈ 5K pace + ~10 s/km (5K is run slightly above threshold).
  return { s_per_km: p.s_per_km + RUN_THRESHOLD_OVER_5K_S, source: `${p.source}+threshold_offset`, estimated: true };
}

/** Erg THRESHOLD split in s/500m (the test result). The 2K/1K TT pace ≈ threshold. */
function resolveErgThreshold500(
  modality: 'row' | 'ski',
  b: AthleteBenchmarks,
): { s_per_500m: number; source: string; estimated: boolean } | null {
  return modality === 'ski' ? resolveSkiSplit500(b) : resolveRowSplit500(b);
}

// ── Benchmarks → per-modality threshold (the onboarding→zones bridge) ─────────
// One threshold per pacing modality the athlete has a benchmark for. This is the
// SAME math the manual test entry uses (a test produces a threshold directly),
// only the threshold is DERIVED from the onboarding benchmark instead of typed:
// run from the 5K/10K time (+threshold offset, estimated), row/ski from the
// 2K/1K erg TT (≈ threshold). A modality with no benchmark is honestly absent
// from the result — never fabricated. The caller feeds each threshold to
// `resolveZonesForAthlete` (the single zone resolver) to get the 6 bands.

/** A modality's threshold pace derived from benchmarks, ready for the resolver. */
export interface ModalityThreshold {
  modality: 'run' | 'row' | 'ski';
  /** Threshold pace (the Z4 lower bound) in seconds per `pace_unit`. */
  threshold_s: number;
  pace_unit: ZonePaceUnit;
  /** Which anchor produced it (audit) — e.g. 'time_5k_seconds'. */
  source: string;
  /** True when a fallback/estimation was used (e.g. run threshold from 5K pace). */
  estimated: boolean;
}

/**
 * Derive a threshold pace per pacing modality (run/row/ski) from an athlete's
 * benchmarks, reusing the documented per-modality threshold resolvers. Only
 * modalities WITH a usable benchmark appear in the result (honest — no fabricated
 * zone for a modality the athlete never tested). Pure.
 */
export function deriveModalityThresholds(b: AthleteBenchmarks): ModalityThreshold[] {
  const out: ModalityThreshold[] = [];
  const run = resolveRunThresholdPerKm(b);
  if (run) out.push({ modality: 'run', threshold_s: run.s_per_km, pace_unit: 'per_km', source: run.source, estimated: run.estimated });
  const row = resolveErgThreshold500('row', b);
  if (row) out.push({ modality: 'row', threshold_s: row.s_per_500m, pace_unit: 'per_500m', source: row.source, estimated: row.estimated });
  const ski = resolveErgThreshold500('ski', b);
  if (ski) out.push({ modality: 'ski', threshold_s: ski.s_per_500m, pace_unit: 'per_500m', source: ski.source, estimated: ski.estimated });
  return out;
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

  // zone Zn / "zone n" — pace zones are 1-6 (Z6 = Sprint); HR zones are 1-5, so a
  // bare "Z6" with no pacing modality resolves to the Z5 HR ceiling (HR can't
  // distinguish VO2max from sprint).
  const z = s.match(/z(?:one)?\s*([1-6])/);
  if (z) {
    const n = Number(z[1]);
    const modality: 'run' | 'row' | 'ski' | 'bike' | null = /ski/.test(s)
      ? 'ski'
      : /row|remo/.test(s)
        ? 'row'
        : /bike|bici|cycl/.test(s)
          ? 'bike'
          : /run|corr/.test(s)
            ? 'run'
            : null;
    if (modality) return { kind: 'pace_zone', zone: n as PaceZone, modality };
    const hrZone = (n === 6 ? HR_ZONE_Z6_FALLBACK : n) as HrZone;
    return { kind: 'hr_zone', zone: hrZone };
  }

  return null;
}

// ── Target construction ─────────────────────────────────────────────────────

function hrTarget(zone: HrZone, b: AthleteBenchmarks): ResolvedTarget | null {
  // ONE model: the same bands the athlete's phone paints and the coach's
  // time-in-zone counts against. A watch must never receive a band this file
  // computed on its own terms.
  const zones = resolveHrZones(b);
  if (!zones) {
    // No anchor at all → return the zone itself; the caller leaves the step open
    // and keeps the label, rather than inventing a band (watch-workout does).
    return { target: { kind: 'hr_zone', value: zone }, source: 'hr_zone(no_anchor)', estimated: true };
  }
  const band = hrBandFor(zone, zones);
  if (!band) return { target: { kind: 'hr_zone', value: zone }, source: 'hr_zone(no_band)', estimated: true };
  // Z1 is open-ended at the bottom → no min bound. exactOptionalPropertyTypes:
  // omit the key entirely rather than set it to undefined.
  const target: Target =
    band.min_bpm == null
      ? { kind: 'hr_bpm', max: band.max_bpm }
      : { kind: 'hr_bpm', min: band.min_bpm, max: band.max_bpm };
  return { target, source: zones.source, estimated: zones.estimated };
}

/**
 * Turn one resolved absolute zone band into a pace Target. fast_s = faster bound
 * (smaller seconds → min_s); slow_s = slower bound (→ max_s). An open band (slow_s
 * null, the Z1 case) yields a one-sided "no faster than" range with only min_s.
 */
function zoneToPaceTarget(zone: ResolvedZone, unit: ZonePaceUnit): Target {
  const min_s = Math.round(zone.fast_s);
  if (zone.slow_s === null) return { kind: 'pace', unit, min_s };
  const max_s = Math.round(zone.slow_s);
  return { kind: 'pace', unit, min_s: Math.min(min_s, max_s), max_s: Math.max(min_s, max_s) };
}

/** The zone band for a 1-6 zone number, from coach rows or the standard default. */
function bandForZone(zone: PaceZone, unit: ZonePaceUnit, threshold_s: number, coachZones?: CoachZone[]): ResolvedZone | null {
  const model = coachZones && coachZones.some((z) => z.pace_unit === unit) ? coachZones : standardZonesFor(unit).slice();
  const resolved = resolveZonesForAthlete({ modality: unit === 'per_km' ? 'run' : 'row', threshold_s, pace_unit: unit }, model);
  return findResolvedZone(resolved, `Z${zone}`);
}

function runPaceTarget(zone: PaceZone, b: AthleteBenchmarks, coachZones?: CoachZone[]): ResolvedTarget | null {
  const t = resolveRunThresholdPerKm(b);
  if (!t) return null;
  const band = bandForZone(zone, 'per_km', t.s_per_km, coachZones);
  if (!band) return null;
  return { target: zoneToPaceTarget(band, 'per_km'), source: t.source, estimated: t.estimated };
}

function ergPaceTarget(zone: PaceZone, modality: 'row' | 'ski', b: AthleteBenchmarks, coachZones?: CoachZone[]): ResolvedTarget | null {
  const t = resolveErgThreshold500(modality, b);
  if (!t) return null;
  const band = bandForZone(zone, 'per_500m', t.s_per_500m, coachZones);
  if (!band) return null;
  return { target: zoneToPaceTarget(band, 'per_500m'), source: t.source, estimated: false };
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
  // HR has only 5 zones; Z6 (sprint) maps onto the Z5 HR ceiling.
  const hrZone = (zone === 6 ? HR_ZONE_Z6_FALLBACK : zone) as HrZone;
  const hr = hrTarget(hrZone, b);
  if (hr) return { ...hr, source: `${hr.source} (bike ${minW}-${maxW}W @${Math.round(f.hi * 100)}%FTP)` };
  return { target: { kind: 'hr_zone', value: hrZone }, source: `bike ${minW}-${maxW}W @FTP`, estimated: true };
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
  // The coach's methodology_zones rows (the 6-zone OFFSET model, 0061). When
  // provided, pace-zone bands come from the coach's edited model; otherwise the
  // seeded STANDARD bands are used. Single source — the same rows the test
  // resolver (resolveZonesForAthlete) and the stored athlete_zone_profiles use.
  coachZones?: CoachZone[];
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
      if (parsed.modality === 'run') return runPaceTarget(parsed.zone, benchmarks, opts.coachZones);
      if (parsed.modality === 'row' || parsed.modality === 'ski')
        return ergPaceTarget(parsed.zone, parsed.modality, benchmarks, opts.coachZones);
      if (parsed.modality === 'bike') return bikePowerTarget(parsed.zone, benchmarks);
      return null;
    case 'hr_zone': {
      // Bare "Z2": if the line's modality is a pacing one, prefer the pace zone.
      const m = opts.modality;
      if (m === 'run') return runPaceTarget(parsed.zone, benchmarks, opts.coachZones) ?? hrTarget(parsed.zone, benchmarks);
      if (m === 'row' || m === 'ski')
        return ergPaceTarget(parsed.zone, m, benchmarks, opts.coachZones) ?? hrTarget(parsed.zone, benchmarks);
      if (m === 'bike') return bikePowerTarget(parsed.zone, benchmarks);
      return hrTarget(parsed.zone, benchmarks);
    }
  }
}
