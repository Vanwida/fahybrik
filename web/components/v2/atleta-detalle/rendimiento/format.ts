// Pure, client-safe formatting helpers for the Rendimiento tab. Time formatting
// reuses the canonical `formatClock` (single source across the coach surfaces) so
// mm:ss never drifts between the race hub and the diagnostics.

import { formatClock } from '@/lib/dashboard/coach/race-labels';

/** Shared placeholder for a missing value — a muted "—", never a fake number. */
export const EM_DASH = '—';

const INT_FMT = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });

/** mm:ss (or h:mm:ss above the hour) from seconds; EM_DASH when null/≤0. */
export function fmtClock(seconds: number | null | undefined): string {
  return formatClock(seconds) ?? EM_DASH;
}

/** mm:ss/km pace from seconds-per-km; EM_DASH when null/≤0. */
export function fmtPace(secPerKm: number | null | undefined): string {
  const c = formatClock(secPerKm);
  return c ? `${c}/km` : EM_DASH;
}

/** es-ES rounded integer with a unit suffix; EM_DASH when null. */
export function fmtInt(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? EM_DASH : INT_FMT.format(Math.round(n));
}

/** A ratio (e.g. 0.084) as an integer percentage string "8%"; EM_DASH when null. */
export function fmtRatioPct(ratio: number | null | undefined): string {
  return ratio == null || !Number.isFinite(ratio) ? EM_DASH : `${Math.round(ratio * 100)}%`;
}

/** Last non-null value of a numeric series (or null when all gaps). */
export function lastNonNull(values: ReadonlyArray<number | null>): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v != null) return v;
  }
  return null;
}

/** First non-null value of a numeric series (or null when all gaps). */
export function firstNonNull(values: ReadonlyArray<number | null>): number | null {
  for (const v of values) if (v != null) return v;
  return null;
}

/** Count of finite readings — the Sparkline needs ≥2 to draw a line. */
export function finiteCount(values: ReadonlyArray<number | null>): number {
  let n = 0;
  for (const v of values) if (v != null) n++;
  return n;
}

/**
 * Trend colour token for a metric sparkline: green when the series improved end
 * to end, warn when it regressed, faint when flat / undecidable. `lowerIsBetter`
 * flips the sense (a run pace or station time improves as it goes DOWN, power as
 * it goes UP), so an improving trend always reads green regardless of direction.
 */
export function trendStrokeVar(
  values: ReadonlyArray<number | null>,
  lowerIsBetter: boolean,
): '--v2-ok' | '--v2-warn' | '--v2-faint' {
  const first = firstNonNull(values);
  const last = lastNonNull(values);
  if (first == null || last == null || first === last) return '--v2-faint';
  const improved = lowerIsBetter ? last < first : last > first;
  return improved ? '--v2-ok' : '--v2-warn';
}
