// Garmin activity/lap → segment_executions modality + modality-native intensity.
//
// WHY
// ---
// Migration 0045 added per-segment modality / pace / power columns so coach
// analytics can split RUN vs ROW/SKI/BIKE vs STRENGTH volume + intensity. iOS
// already populates these on finished segments. Garmin laps carry the same
// physical signals (distance, duration, HR, power, cadence/stroke-rate), so we
// derive the SAME columns here — otherwise Garmin-sourced workouts (which WIN
// over HealthKit) would be invisible to the run-vs-row breakdown.
//
// Modality is the canonical @fahybrid/shared `Modality` vocabulary so the whole
// system speaks one language (DRY — no Garmin-private modality strings leak into
// segment_executions.modality, which analytics group by).

import type { Modality } from '@fahybrid/shared/domain/prescription';

// Garmin Health Activity API `activityType` enum → canonical Modality.
// Garmin sends UPPER_SNAKE values (e.g. RUNNING, INDOOR_ROWING, CYCLING).
// Unknown / unmapped types fall through to undefined so analytics can fall back
// to exercises.category/slug (per the 0045 column comment).
const GARMIN_ACTIVITY_MODALITY: Record<string, Modality> = {
  RUNNING: 'run',
  INDOOR_RUNNING: 'run',
  TRAIL_RUNNING: 'run',
  TREADMILL_RUNNING: 'run',
  STREET_RUNNING: 'run',
  TRACK_RUNNING: 'run',
  ROWING: 'row',
  INDOOR_ROWING: 'row',
  ROWING_V2: 'row',
  CYCLING: 'bike',
  INDOOR_CYCLING: 'bike',
  ROAD_BIKING: 'bike',
  MOUNTAIN_BIKING: 'bike',
  VIRTUAL_RIDE: 'bike',
  BIKING: 'bike',
  // Garmin labels ski-erg sessions as a fitness-equipment type; the safest
  // canonical fit is 'ski' when the device reports it explicitly.
  SKI_ERG: 'ski',
  STRENGTH_TRAINING: 'strength',
  INDOOR_CARDIO: 'functional',
  HIIT: 'functional',
  FITNESS_EQUIPMENT: 'functional',
  YOGA: 'mobility',
  PILATES: 'mobility',
};

export function garminActivityToModality(
  activityType: string | undefined | null,
): Modality | null {
  if (!activityType) return null;
  return GARMIN_ACTIVITY_MODALITY[activityType.toUpperCase()] ?? null;
}

// Per-modality intensity derived from a single lap. Distances are metres,
// durations seconds. We compute:
//   - run modality   → avg_pace_s_per_km
//   - row/ski/bike   → avg_pace_s_per_500m
//   - any erg        → avg_power_w (if the lap carries power)
//   - row/ski        → stroke_rate_spm (if the lap carries it)
// All optional; a field stays null when its source signal is missing or the
// modality doesn't use it. Pace requires positive distance AND duration.
export type LapIntensity = {
  avg_pace_s_per_km: number | null;
  avg_pace_s_per_500m: number | null;
  avg_power_w: number | null;
  stroke_rate_spm: number | null;
};

const ERG_MODALITIES: ReadonlySet<Modality> = new Set<Modality>(['row', 'ski', 'bike']);

export function deriveLapIntensity(args: {
  modality: Modality | null;
  distance_meters: number | null | undefined;
  duration_seconds: number | null | undefined;
  power_w?: number | null;
  stroke_rate_spm?: number | null;
}): LapIntensity {
  const out: LapIntensity = {
    avg_pace_s_per_km: null,
    avg_pace_s_per_500m: null,
    avg_power_w: null,
    stroke_rate_spm: null,
  };
  const dist = num(args.distance_meters);
  const dur = num(args.duration_seconds);
  const hasPace = dist != null && dist > 0 && dur != null && dur > 0;

  if (args.modality === 'run' && hasPace) {
    out.avg_pace_s_per_km = round2((dur! / dist!) * 1000);
  }
  if (args.modality && ERG_MODALITIES.has(args.modality) && hasPace) {
    out.avg_pace_s_per_500m = round2((dur! / dist!) * 500);
  }
  const power = num(args.power_w);
  if (power != null && power >= 0) out.avg_power_w = round1(power);
  const spm = num(args.stroke_rate_spm);
  if (spm != null && spm >= 0) out.stroke_rate_spm = round1(spm);
  return out;
}

function num(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
