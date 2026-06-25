// v2 · ZONE VIEW — client-safe presentation helpers for the zone calculator.
// Pure formatting + token mapping only; NO DB / server-only imports, so both the
// calculator and the "registrar resultado" form can use it. The numbers it
// formats come straight from a stored athlete_zone_profiles snapshot — this module
// never computes a band (the resolver does that, once, on write).

import { formatClock } from '@/components/dashboard/programming/studio/prescription-model';
import type {
  AthleteZoneProfile,
  ResolvedZoneSnapshot,
} from '@fahybrid/shared/schema/methodology-system';

export type ProfileModality = AthleteZoneProfile['modality']; // 'row'|'ski'|'run'|'bike'

/** Coach-facing label for a stored profile modality. */
export const MODALITY_LABEL: Record<ProfileModality, string> = {
  row: 'Remo',
  ski: 'Ski-Erg',
  run: 'Carrera',
  bike: 'Bike-Erg',
};

/** Pace-unit suffix shown next to a range (/500m ergo · /km run). */
export function paceUnitLabel(unit: 'per_500m' | 'per_km'): string {
  return unit === 'per_km' ? '/km' : '/500m';
}

/** The v2 zone-token CSS var name for a 1-6 sort_order (the calculator dot/rail). */
export function zoneVar(sortOrder: number): string {
  const n = Math.min(6, Math.max(1, sortOrder));
  return `--v2-z${n}`;
}

export function zoneSoftVar(sortOrder: number): string {
  const n = Math.min(6, Math.max(1, sortOrder));
  return `--v2-z${n}-soft`;
}

/**
 * Format one resolved band's pace RANGE faithfully to Pablo's calculator:
 *   - open band (slow_s null, the Z1 case)  → "> {fast}"  (no faster than)
 *   - closed band                           → "{fast}–{slow}"  (fast first)
 * fast_s is the FASTER bound (smaller seconds); slow_s the slower bound.
 */
export function formatZoneRange(zone: ResolvedZoneSnapshot): string {
  const fast = formatClock(Math.round(zone.fast_s));
  if (zone.slow_s == null) return `> ${fast}`;
  const slow = formatClock(Math.round(zone.slow_s));
  return `${fast}–${slow}`;
}

/** The athlete's test result string for the result bar / column header (m:ss). */
export function formatThreshold(threshold_s: number): string {
  return formatClock(Math.round(threshold_s));
}

/** Whether a stored profile is an ergo (/500m) modality — drives 2-column layout. */
export function isErgo(modality: ProfileModality): boolean {
  return modality === 'row' || modality === 'ski' || modality === 'bike';
}

/** "24 jun 2026" from an ISO datetime — for the result bar. */
export function formatProfileDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/**
 * Split stored profiles into the calculator's two render groups:
 *   ergo   — row/ski/bike (per_500m): rendered as side-by-side columns.
 *   run    — per_km: a single column.
 * Each group is sorted into the canonical display order (row, ski, bike / run).
 */
export function groupProfilesForCalculator(profiles: AthleteZoneProfile[]): {
  ergo: AthleteZoneProfile[];
  run: AthleteZoneProfile[];
} {
  const order: Record<ProfileModality, number> = { row: 0, ski: 1, bike: 2, run: 0 };
  const ergo = profiles
    .filter((p) => isErgo(p.modality))
    .sort((a, b) => order[a.modality] - order[b.modality]);
  const run = profiles.filter((p) => p.modality === 'run');
  return { ergo, run };
}
