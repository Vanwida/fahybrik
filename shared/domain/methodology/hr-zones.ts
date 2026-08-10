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
//
// THE LADDER HAS FOUR RUNGS AND THREE CONFIDENCES (29-jul-2026).
// measured → declared → estimated(max HR) → estimated(age). The middle rung was
// added because the athlete's OWN number is data, not arithmetic: he may know his
// threshold from a lab, a coach or a watch, and binning it while showing him a
// band derived from his birthday was the system distrusting him and trusting
// itself. It is labelled as his, he can change it, and a test supersedes it.
//
// The last two rungs are POPULATION GENERALIZATIONS. They exist so nobody is left
// without zones to train against, they are always labelled estimated, and nothing
// may score them as evidence (see `confidence`). The ORDER is what makes that
// safe: a generalization can never displace a real measurement, only fill its
// absence.

// ── The anchor's inputs ──────────────────────────────────────────────────────
// Deliberately narrower than `AthleteBenchmarks`: the HR model needs three
// numbers and nothing else. Keeping it narrow is what lets `zones.ts` depend on
// this file instead of the other way round.
export interface HrAnchors {
  /** Threshold HR MEASURED by a test we ran (`lthr_30min`). The strongest anchor. */
  lthr_bpm?: number | null;
  /**
   * Threshold HR the ATHLETE declared — onboarding, or their profile. It is his
   * number, not ours and not a test's: he may have it from a lab, from a coach, or
   * from a watch that detects it. It outranks anything we could infer, and is
   * outranked by a test the moment one exists.
   */
  lthr_declared_bpm?: number | null;
  /** Max HR (`athletes.max_hr_bpm`). Yields an ESTIMATED threshold. */
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

/** Where the five bands start and end, as fractions of LTHR. */
export type HrZoneFractions = Record<HrZone, { lo: number; hi: number }>;

/**
 * The zone bands as fractions of LTHR (spec §5 hr_zone_matrix). Z4 straddles 1.0
 * because the threshold IS the Z4 band — the same shape as the pace model, where
 * the test result is the Z4 lower bound.
 *
 * THE SYSTEM DEFAULT, not a law (10-ago-2026). WHERE the bands cut is the
 * coach's METHOD, not our mechanism: another competent coach would put Z2's
 * ceiling somewhere else, so these nine numbers are the value a coach who has
 * never touched anything gets, and `coach_hr_method` is where he moves them
 * (HARD RULE Nº0). What stays OURS is everything around them — that a zone is a
 * fraction of the THRESHOLD, the order of the anchor's evidence, and
 * `zoneForBpm`.
 *
 * Still the single source: nothing else in the codebase may hold a zone
 * fraction, and the coach's row is read through
 * `shared/domain/coach/hr-method.ts`, which builds its defaults from HERE.
 */
export const DEFAULT_HR_ZONE_FRACTIONS: HrZoneFractions = {
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
  /** True when WE inferred the threshold. False for measured AND for declared. */
  estimated: boolean;
  /** Which anchor produced it — audit trail, and the copy the UI explains with. */
  source: HrAnchorSource;
  /** measured | declared | estimated. Use this to decide what may be SCORED. */
  confidence: HrAnchorConfidence;
  /** The five bands, easiest → hardest. */
  bands: HrZoneBand[];
}

/**
 * Which rung of the fallback chain produced the threshold. A closed set so the
 * UI can say WHY a number is estimated without parsing a string, and so the
 * coach's view can distinguish "measured" from "we guessed from their birthday".
 */
export type HrAnchorSource = 'lthr_measured' | 'lthr_declared' | 'from_max_hr' | 'from_age';

/**
 * How much the anchor is worth as evidence — THREE tiers, not two.
 *
 *   measured  — a test we ran produced it.
 *   declared  — the athlete's own number. His data, not ours and not fabricated:
 *               it populates the app, it is labelled as his, he can edit or delete
 *               it, and it is superseded the moment a test lands.
 *   estimated — WE inferred it (from a max HR, or from a birthday). It is a
 *               population generalization: fine to train against, never evidence.
 *
 * The boolean `estimated` was never able to express this. Keeping only a boolean
 * is what let a birthday and a lab test look like the same claim downstream.
 */
export type HrAnchorConfidence = 'measured' | 'declared' | 'estimated';

/** Confidence per rung. The ONE place the mapping lives. */
export const HR_ANCHOR_CONFIDENCE: Record<HrAnchorSource, HrAnchorConfidence> = {
  lthr_measured: 'measured',
  lthr_declared: 'declared',
  from_max_hr: 'estimated',
  from_age: 'estimated',
};

/** Human-readable, athlete-facing, Spanish. Used by every surface that labels a
 *  band, so "estimada" is worded identically on the phone and in the dashboard. */
export const HR_ANCHOR_LABEL: Record<HrAnchorSource, string> = {
  lthr_measured: 'Medido en tu test de umbral',
  lthr_declared: 'El que tú nos diste',
  from_max_hr: 'Estimado desde tu FC máxima',
  from_age: 'Estimado por tu edad',
};

/** One resolved anchor: the number, the rung it came from, and what it is worth. */
export interface ResolvedThresholdHr {
  lthr_bpm: number;
  /** True only for OUR inferences. A declared threshold is not our estimate. */
  estimated: boolean;
  source: HrAnchorSource;
  confidence: HrAnchorConfidence;
}

/**
 * The athlete's threshold HR, strongest evidence first.
 *
 *   1. a MEASURED LTHR — a test we ran;
 *   2. a DECLARED LTHR — the athlete's own number. It beats anything we could
 *      infer (it is data, not arithmetic) and loses to a test the day one exists;
 *   3. 0.88 × max HR — one inference;
 *   4. 0.88 × Tanaka(age) — two inferences, and the weakest thing we will accept.
 *
 * Rungs 3-4 are population generalizations: they exist so an athlete is not left
 * without zones, they are labelled as estimates, and nothing may score them as
 * evidence. The ORDER is the guarantee: a measured threshold always beats a
 * birthday, so the generalization can never displace a real measurement.
 *
 * Null when none of the four is available.
 */
export function resolveThresholdHr(a: HrAnchors): ResolvedThresholdHr | null {
  const at = (lthr_bpm: number, source: HrAnchorSource): ResolvedThresholdHr => ({
    lthr_bpm,
    source,
    confidence: HR_ANCHOR_CONFIDENCE[source],
    estimated: HR_ANCHOR_CONFIDENCE[source] === 'estimated',
  });

  if (a.lthr_bpm != null && a.lthr_bpm > 0) return at(a.lthr_bpm, 'lthr_measured');
  if (a.lthr_declared_bpm != null && a.lthr_declared_bpm > 0) {
    return at(a.lthr_declared_bpm, 'lthr_declared');
  }
  if (a.max_hr_bpm != null && a.max_hr_bpm > 0) {
    return at(a.max_hr_bpm * LTHR_FROM_HRMAX, 'from_max_hr');
  }
  if (a.age_years != null && a.age_years > 0 && a.age_years < 120) {
    const hrmax = TANAKA_INTERCEPT - TANAKA_SLOPE * a.age_years;
    return at(hrmax * LTHR_FROM_HRMAX, 'from_age');
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
export function resolveHrZones(
  a: HrAnchors,
  /**
   * Where the bands cut. The COACH's, when the caller has resolved his row;
   * ours by default, so every surface that has no coach in hand (the pure
   * model tests, the design twin) behaves exactly as it did before the bands
   * became data.
   */
  fractions: HrZoneFractions = DEFAULT_HR_ZONE_FRACTIONS,
): AthleteHrZones | null {
  const anchor = resolveThresholdHr(a);
  if (!anchor) return null;

  const bands: HrZoneBand[] = HR_ZONES.map((zone) => {
    const f = fractions[zone];
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
    confidence: anchor.confidence,
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

/** DÓNDE estás dentro de tu zona, y hacia dónde vas. */
export interface HrZonePosition {
  zone: HrZone;
  /**
   * 0…1 dentro de la banda: 0 = acabas de entrar por abajo, 1 = estás a un
   * latido de la siguiente. Sobre Z5 se satura a 1 — no hay más arriba.
   */
  fraction: number;
  /** La zona hacia la que subes, o null en Z5 (no hay siguiente). */
  next: HrZone | null;
  /** La zona a la que caerías bajando, o null en Z1. */
  previous: HrZone | null;
}

/**
 * DÓNDE ESTÁS DENTRO DE TU ZONA — no sólo en cuál.
 *
 * «Z3» contesta en qué banda estás, y se queda a medias: a 145 y a 158 pone lo
 * mismo, y uno de los dos está a punto de irse a Z4. Corriendo, eso es
 * exactamente la información que gobierna si aprietas o aflojas, y hoy no la
 * pinta nadie. Esta fracción es lo que deja que la pantalla se llene del color
 * de la zona y vaya derivando hacia el color de la siguiente conforme te
 * acercas — un dato que se lee sin enfocar la vista.
 *
 * MECANISMO, no método: las bandas las pone el coach (`AthleteHrZones`), esto
 * sólo dice en qué punto de la suya está el atleta. Cambia el coach las bandas
 * y esto sigue contestando bien sin tocar una línea.
 *
 * El suelo de Z1 es null a propósito en el modelo («no hay suelo para ir
 * suave»): se toma 0 como base, así que un pulso de reposo da una fracción
 * pequeña y uno de rodaje suave, una alta. Es cierto en los dos casos.
 */
export function hrZonePosition(bpm: number, zones: AthleteHrZones): HrZonePosition | null {
  const zone = zoneForBpm(bpm, zones);
  if (zone == null) return null;
  const band = hrBandFor(zone, zones);
  if (!band) return null;

  const lo = band.min_bpm ?? 0;
  const hi = band.max_bpm;
  // Una banda degenerada (lo ≥ hi) no puede producir una fracción honesta: se
  // dice que estás dentro y ya, en vez de dividir por cero o inventar medio.
  const span = hi - lo;
  const raw = span > 0 ? (bpm - lo) / span : 1;
  const fraction = Math.min(1, Math.max(0, raw));

  const next = zones.bands.find((b) => b.zone === zone + 1)?.zone ?? null;
  const previous = zones.bands.find((b) => b.zone === zone - 1)?.zone ?? null;
  return { zone, fraction, next, previous };
}
