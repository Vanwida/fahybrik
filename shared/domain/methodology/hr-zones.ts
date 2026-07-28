// HEART-RATE ZONES — the ONE model. Anchored on the THRESHOLD, never on the max.
//
// WHY THIS FILE EXISTS
// --------------------
// On 28-jul-2026 the app had THREE heart-rate zone models that disagreed with
// each other about what "Z3" means:
//
//   1. this one — %LTHR, 5 bands — which resolves the coach's `Z4` into the bpm
//      alert a Garmin/Suunto receives;
//   2. iOS `ZoneColors.swift` — %HRmax, 5 bands (0.60/0.70/0.80/0.90) — which
//      drove the live HUD and, worse, the `zone_seconds` the COACH reads back;
//   3. the coach analytics — the same %HRmax ladder against a hardcoded 200 bpm.
//
// With a real athlete (id 64, dob 1982, no measured max) model 1 put Z2 at
// 128–137 ppm and model 2 put it at 106–124: DISJOINT bands. At 130 ppm the
// athlete was exactly where the coach wanted them, and the app told them they
// were in Z3 and pushing too hard.
//
// THE DECISION (28-jul-2026): the threshold model wins, everywhere.
// A zone is a fraction of the LACTATE THRESHOLD heart rate, because the threshold
// is what a test measures and what the coach prescribes against. The maximum is
// not a training anchor — it is a number almost nobody has measured, and
// estimating it from age and then taking a percentage of an estimate is two
// guesses stacked. The client no longer computes zones at all: the server
// resolves them here, once, and every surface paints what it is given.
//
// NO ANCHOR → NO ZONES. `resolveHrZones` returns null rather than invent one.
// A labelled-but-fabricated band is worse than an absent one: it is indis-
// tinguishable from a real one at a glance, and it silently becomes evidence
// (the `zone_seconds` a coach uses to decide next week's load).

// ── The anchor's inputs ──────────────────────────────────────────────────────
// Deliberately narrower than `AthleteBenchmarks`: the HR model needs three
// numbers and nothing else. Keeping it narrow is what lets `zones.ts` depend on
// this file instead of the other way round.
export interface HrAnchors {
  /** Measured lactate-threshold HR. The only non-estimated anchor. */
  lthr_bpm?: number | null;
  /** Measured max HR (`athletes.max_hr_bpm`). Yields an ESTIMATED threshold. */
  max_hr_bpm?: number | null;
  /** Age, for the last-resort estimate. Derived from `athletes.dob`. */
  age_years?: number | null;
}

/** The five heart-rate zones. HR cannot distinguish VO₂max from a sprint, so the
 *  model stops at 5 — a true sprint is prescribed by pace or power, not by FC. */
export type HrZone = 1 | 2 | 3 | 4 | 5;

// Tanaka HRmax estimate: 208 − 0.7·age (the published value; the spec's 207 is a
// typo). Only ever used to reach a threshold, never shown as "your max".
const TANAKA_INTERCEPT = 208;
const TANAKA_SLOPE = 0.7;
/** LTHR ≈ 0.88 · HRmax (spec §5) when only a maximum is known. */
const LTHR_FROM_HRMAX = 0.88;

/**
 * The zone bands as fractions of LTHR (spec §5 hr_zone_matrix). Z4 straddles 1.0
 * because the threshold IS the Z4 band — the same shape as the pace model, where
 * the test result is the Z4 lower bound.
 *
 * THE SINGLE SOURCE. Nothing else in the codebase may hold a zone fraction.
 */
const HR_ZONE_FRACTIONS: Record<HrZone, { lo: number; hi: number }> = {
  1: { lo: 0.0, hi: 0.81 },
  2: { lo: 0.82, hi: 0.88 },
  3: { lo: 0.89, hi: 0.94 },
  4: { lo: 0.95, hi: 1.02 },
  5: { lo: 1.03, hi: 1.15 }, // open-ended ≥1.03; capped at a sane physiological hi
};

/** Zone order, easiest first — the order every surface renders them in. */
export const HR_ZONES: readonly HrZone[] = [1, 2, 3, 4, 5];

/** One resolved band, in absolute beats per minute. */
export interface HrZoneBand {
  zone: HrZone;
  /** Lower bound, inclusive. Null on Z1 — there is no floor to being easy. */
  min_bpm: number | null;
  /** Upper bound, inclusive. */
  max_bpm: number;
}

/** An athlete's whole HR zone model, resolved. */
export interface AthleteHrZones {
  /** The anchor every band is a fraction of. */
  lthr_bpm: number;
  /** True when the threshold was inferred rather than measured. */
  estimated: boolean;
  /** Which anchor produced it — audit trail, and the copy the UI explains with. */
  source: HrAnchorSource;
  /** The five bands, easiest → hardest. */
  bands: HrZoneBand[];
}

/**
 * Which rung of the fallback chain produced the threshold. A closed set so the
 * UI can say WHY a number is estimated without parsing a string, and so the
 * coach's view can distinguish "measured" from "we guessed from their birthday".
 */
export type HrAnchorSource = 'lthr_measured' | 'from_max_hr' | 'from_age';

/** Human-readable, athlete-facing, Spanish. Used by every surface that labels a
 *  band, so "estimada" is worded identically on the phone and in the dashboard. */
export const HR_ANCHOR_LABEL: Record<HrAnchorSource, string> = {
  lthr_measured: 'Medido en tu test de umbral',
  from_max_hr: 'Estimado desde tu FC máxima',
  from_age: 'Estimado por tu edad',
};

/**
 * The athlete's threshold HR, strongest evidence first.
 *
 *   1. a measured LTHR — the real thing;
 *   2. 0.88 × a measured max HR — one inference;
 *   3. 0.88 × Tanaka(age) — two inferences, and the weakest thing we will accept.
 *
 * Null when none of the three is available. That null is the whole point: it is
 * what makes "aún no tienes zonas" possible instead of a fabricated 184.
 */
export function resolveThresholdHr(
  a: HrAnchors,
): { lthr_bpm: number; estimated: boolean; source: HrAnchorSource } | null {
  if (a.lthr_bpm != null && a.lthr_bpm > 0) {
    return { lthr_bpm: a.lthr_bpm, estimated: false, source: 'lthr_measured' };
  }
  if (a.max_hr_bpm != null && a.max_hr_bpm > 0) {
    return { lthr_bpm: a.max_hr_bpm * LTHR_FROM_HRMAX, estimated: true, source: 'from_max_hr' };
  }
  if (a.age_years != null && a.age_years > 0 && a.age_years < 120) {
    const hrmax = TANAKA_INTERCEPT - TANAKA_SLOPE * a.age_years;
    return { lthr_bpm: hrmax * LTHR_FROM_HRMAX, estimated: true, source: 'from_age' };
  }
  return null;
}

/**
 * The athlete's five absolute HR bands. Null when there is no anchor at all —
 * the caller then tells the athlete they have no zones yet and points them at the
 * threshold test, which is the only thing that produces a real one.
 *
 * Pure. Every surface (iOS HUD, watch alert, coach analytics, time-in-zone)
 * resolves through here, so a band cannot mean two things in two places.
 */
export function resolveHrZones(a: HrAnchors): AthleteHrZones | null {
  const anchor = resolveThresholdHr(a);
  if (!anchor) return null;

  const bands: HrZoneBand[] = HR_ZONES.map((zone) => {
    const f = HR_ZONE_FRACTIONS[zone];
    return {
      zone,
      // Z1 has no floor: any pulse below the Z2 entry is recovery.
      min_bpm: zone === 1 ? null : Math.round(anchor.lthr_bpm * f.lo),
      max_bpm: Math.round(anchor.lthr_bpm * f.hi),
    };
  });

  return {
    lthr_bpm: Math.round(anchor.lthr_bpm),
    estimated: anchor.estimated,
    source: anchor.source,
    bands,
  };
}

/**
 * The zone a live pulse falls in. The TOP band is open-ended — a pulse above the
 * physiological cap is still Z5, there is no zone beyond the last one. Returns
 * null for a non-positive reading.
 *
 * Shared by the server (time-in-zone, polarization) and mirrored on iOS against
 * the very same bands, so a beat classified on the phone and the same beat
 * classified on the server land in the same zone.
 */
export function zoneForBpm(bpm: number, zones: AthleteHrZones): HrZone | null {
  if (!Number.isFinite(bpm) || bpm <= 0) return null;
  for (const band of zones.bands) {
    if (bpm <= band.max_bpm) return band.zone;
  }
  return 5;
}

/** One band by zone number. Null when the model has no such zone. */
export function hrBandFor(zone: HrZone, zones: AthleteHrZones): HrZoneBand | null {
  return zones.bands.find((b) => b.zone === zone) ?? null;
}
