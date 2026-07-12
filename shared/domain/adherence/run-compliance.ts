// Per-SEGMENT running compliance (#66) — did the athlete hit the prescribed
// intensity of EACH run tramo? This is the running-specific, DIRECTIONAL sibling
// of `bands.ts`: where bands.ts grades a prescribed-vs-real delta by MAGNITUDE
// (green/amber/red by how far off), a coach reviewing a run session wants the
// DIRECTION — did the athlete run this rep TOO HARD (faster/higher HR than the
// band) or TOO EASY (slower/lower)? A structured interval already carries an
// explicit acceptance BAND (the coach authored "4:25–4:35"); the band IS the
// tolerance, so we judge in-band vs out-fast vs out-slow rather than % off.
//
// THE 4 VERDICTS (objective, per the #66 spec)
//   · dentro        — the executed value falls inside the prescribed band.
//   · fuera_rapido  — MORE intense than prescribed (faster pace / higher HR /
//                     higher RPE than the band's intense edge).
//   · fuera_lento   — LESS intense than prescribed (slower / lower).
//   · sin_dato      — nothing comparable: no target, or the executed signal the
//                     target needs wasn't captured, or the tramo wasn't executed.
// "rápido/lento" reads for the common case (run zones resolve to a PACE band);
// for an HR- or RPE-targeted tramo the same axis means "más/menos intenso".
//
// SCOPE: this module is PURE — types + comparison + aggregation, zero I/O and no
// dependency on the DB or web layer. The web wire (per-athlete zone resolution,
// structure enumeration, matching executed laps) adapts real data onto these
// primitives. Verdict → colour lives in the UI theme via RUN_COMPLIANCE_TIER.

import { DEFAULT_ABSOLUTE_RULE } from './bands';

// ── Verdict ──────────────────────────────────────────────────────────────────
export const RUN_COMPLIANCE_VERDICTS = ['dentro', 'fuera_rapido', 'fuera_lento', 'sin_dato'] as const;
export type RunComplianceVerdict = (typeof RUN_COMPLIANCE_VERDICTS)[number];

/** Verdict → the shared semantic tier (colour + icon resolve from the tier in the
 *  UI). 'dentro' is green, both out-of-band directions are amber (a coaching
 *  signal, not a failure — hence no 'error'/red), 'sin_dato' is muted. */
export const RUN_COMPLIANCE_TIER: Record<RunComplianceVerdict, 'success' | 'warning' | 'neutral'> = {
  dentro: 'success',
  fuera_rapido: 'warning',
  fuera_lento: 'warning',
  sin_dato: 'neutral',
};

/** Short coach-facing label per verdict (Spanish). Pace-centric wording for the
 *  common run case; the direction (más/menos intenso) still reads for HR/RPE. */
export const RUN_COMPLIANCE_LABEL: Record<RunComplianceVerdict, string> = {
  dentro: 'En banda',
  fuera_rapido: 'Más rápido',
  fuera_lento: 'Más lento',
  sin_dato: 'Sin dato',
};

// ── Tolerances (named, documented — no magic numbers) ─────────────────────────
/**
 * Half-width of the acceptance window for a SINGLE-VALUE pace target ("@4:30/km"),
 * in seconds per km. ±5 s/km is the convention dedicated running platforms use for
 * "on pace" on a structured interval: tight enough to be meaningful (≈1.5–2.5% at
 * this population's 3:30–5:30/km paces) yet not punish natural per-km variance. It
 * is DELIBERATELY finer than bands.ts's generic relative 10% default, which is
 * nonsensical for pace (10% of 4:00/km = 24 s/km — a different effort entirely).
 * Most coach pace targets are authored as explicit BANDS; this is the fallback for
 * a point target.
 */
export const PACE_POINT_TOLERANCE_S = 5;

/** Half-width for a single-value RPE target, in RPE points. Reuses the adherence
 *  absolute default (±1 point) so the small-integer scale is judged consistently. */
export const RPE_POINT_TOLERANCE = DEFAULT_ABSOLUTE_RULE.on_target_max;

// ── Band + sample ─────────────────────────────────────────────────────────────
// A normalized, per-athlete-RESOLVED comparison band for ONE prescribed tramo.
// `axis` selects which executed signal to judge and fixes the direction semantics
// (pace is inverted: fewer seconds = faster = more intense).
export type ComplianceBand =
  | { axis: 'pace'; fast_s: number | null; slow_s: number | null } // s/km; fast_s = the faster (smaller) edge
  | { axis: 'hr'; min_bpm: number | null; max_bpm: number | null } // bpm
  | { axis: 'rpe'; min: number | null; max: number | null }; // 1..10

/** The executed tramo — only the fields relevant to intensity. Any may be absent. */
export interface ComplianceSample {
  pace_s?: number | null; // executed avg pace, s/km
  hr_bpm?: number | null; // executed avg HR
  rpe?: number | null; // executed tramo RPE (none per-segment today → null)
}

// ── Core comparison ───────────────────────────────────────────────────────────
/**
 * Judge one executed sample against one prescribed band. A `null` band (tramo with
 * no objetivo) or a missing/degenerate signal yields 'sin_dato' — never a fabricated
 * verdict. Band edges are INCLUSIVE (a value exactly on an edge is 'dentro').
 */
export function evaluateRunSegment(band: ComplianceBand | null, sample: ComplianceSample): RunComplianceVerdict {
  if (!band) return 'sin_dato';
  switch (band.axis) {
    case 'pace': {
      const v = sample.pace_s;
      if (v == null || !Number.isFinite(v)) return 'sin_dato';
      if (band.fast_s == null && band.slow_s == null) return 'sin_dato';
      // s/km: smaller = faster = MORE intense.
      if (band.fast_s != null && v < band.fast_s) return 'fuera_rapido';
      if (band.slow_s != null && v > band.slow_s) return 'fuera_lento';
      return 'dentro';
    }
    case 'hr': {
      const v = sample.hr_bpm;
      if (v == null || !Number.isFinite(v)) return 'sin_dato';
      if (band.min_bpm == null && band.max_bpm == null) return 'sin_dato';
      // higher HR = MORE intense → above the max is "too hard".
      if (band.max_bpm != null && v > band.max_bpm) return 'fuera_rapido';
      if (band.min_bpm != null && v < band.min_bpm) return 'fuera_lento';
      return 'dentro';
    }
    case 'rpe': {
      const v = sample.rpe;
      if (v == null || !Number.isFinite(v)) return 'sin_dato';
      if (band.min == null && band.max == null) return 'sin_dato';
      if (band.max != null && v > band.max) return 'fuera_rapido';
      if (band.min != null && v < band.min) return 'fuera_lento';
      return 'dentro';
    }
  }
}

// ── Band builders ─────────────────────────────────────────────────────────────
/** Pace band from an explicit pace target: a min_s/max_s band as-is, else a
 *  single value_s widened by ±PACE_POINT_TOLERANCE_S. */
export function paceBandFromTarget(t: { value_s?: number; min_s?: number; max_s?: number }): ComplianceBand {
  if (t.min_s != null || t.max_s != null) {
    return { axis: 'pace', fast_s: t.min_s ?? null, slow_s: t.max_s ?? null };
  }
  if (t.value_s != null) {
    return { axis: 'pace', fast_s: t.value_s - PACE_POINT_TOLERANCE_S, slow_s: t.value_s + PACE_POINT_TOLERANCE_S };
  }
  return { axis: 'pace', fast_s: null, slow_s: null };
}

/** Pace band from an already-resolved zone band (fast_s = faster/smaller edge,
 *  slow_s = slower/larger edge; slow_s null for an open easy zone). */
export function paceBandFromResolvedZone(fast_s: number | null, slow_s: number | null): ComplianceBand {
  return { axis: 'pace', fast_s, slow_s };
}

/** HR band from a resolved HR target (hr_bpm min/max band, or a bare value). */
export function hrBandFromTarget(t: { value?: number; min?: number; max?: number }): ComplianceBand {
  if (t.min != null || t.max != null) return { axis: 'hr', min_bpm: t.min ?? null, max_bpm: t.max ?? null };
  if (t.value != null) return { axis: 'hr', min_bpm: t.value, max_bpm: t.value };
  return { axis: 'hr', min_bpm: null, max_bpm: null };
}

/** RPE band from an rpe target: a min/max band as-is, else a value widened by
 *  ±RPE_POINT_TOLERANCE. */
export function rpeBandFromTarget(t: { value?: number; min?: number; max?: number }): ComplianceBand {
  if (t.min != null || t.max != null) return { axis: 'rpe', min: t.min ?? null, max: t.max ?? null };
  if (t.value != null) return { axis: 'rpe', min: t.value - RPE_POINT_TOLERANCE, max: t.value + RPE_POINT_TOLERANCE };
  return { axis: 'rpe', min: null, max: null };
}

// ── Session aggregate ─────────────────────────────────────────────────────────
export interface RunComplianceSummary {
  /** Every tramo considered (evaluable + sin_dato). */
  total: number;
  /** Tramos with a real verdict (dentro + fuera_*). The denominator of pct_dentro. */
  evaluable: number;
  dentro: number;
  fuera_rapido: number;
  fuera_lento: number;
  sin_dato: number;
  /** % of EVALUABLE tramos that landed 'dentro'. Null when nothing was evaluable
   *  (all sin_dato) — never 0% or NaN, so the UI can say "sin datos" honestly. */
  pct_dentro: number | null;
}

/** Aggregate a session's per-tramo verdicts into the coach headline number. */
export function summarizeRunCompliance(verdicts: readonly RunComplianceVerdict[]): RunComplianceSummary {
  let dentro = 0;
  let fuera_rapido = 0;
  let fuera_lento = 0;
  let sin_dato = 0;
  for (const v of verdicts) {
    if (v === 'dentro') dentro++;
    else if (v === 'fuera_rapido') fuera_rapido++;
    else if (v === 'fuera_lento') fuera_lento++;
    else sin_dato++;
  }
  const evaluable = dentro + fuera_rapido + fuera_lento;
  return {
    total: verdicts.length,
    evaluable,
    dentro,
    fuera_rapido,
    fuera_lento,
    sin_dato,
    pct_dentro: evaluable > 0 ? Math.round((dentro / evaluable) * 100) : null,
  };
}
