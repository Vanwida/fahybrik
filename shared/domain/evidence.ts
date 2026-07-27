// @fahybrid/shared/domain/evidence — HOW MUCH a number is worth (pure, no I/O).
//
// One vocabulary, shared by every surface that predicts a race segment: WHERE the
// number came from, HOW MUCH it still weighs today, and HOW WIDE its band is.
// Living in a leaf module (no dependencies) so race-transfer, goal-gap,
// dobles-gap and the mark projection all speak it without importing each other.
//
// THE TWO RULES IT OWNS
//
//   1. Evidence AGES, continuously. A race five months old is not the truth of
//      today. It does not fall off a cliff on some birthday: it loses weight
//      smoothly against the current estimate, so a month of training always moves
//      the number by something.
//   2. Every number carries a BAND, and the band is a function of the source. A
//      split the athlete actually ran is narrow; a station guessed from a
//      reference is wide. The band is the honest part — see ley 1 of
//      docs/race-projection-spec.html ("rango, nunca un número solo").

// ── Where a number comes from ────────────────────────────────────────────────

/**
 * The provenance of one predicted segment, strongest first. It travels on the
 * wire next to the coarse `tier` (observado | estimado | sin_datos), which it
 * refines: two `estimado` segments built from a measured 1000 m and from a wrist
 * VO₂max are not the same claim, and the athlete deserves to be told which is which.
 *
 *   · carrera      — the athlete's own split in a real HYROX. Ages.
 *   · simulacion   — their split in a HYROX simulation measured by the app. Ages.
 *   · marca        — a «Probarme» benchmark (a time trial the app measured, or a
 *                    race the athlete registered), re-expressed at race distance.
 *   · vo2max       — the watch's VO₂max, turned into a sustainable pace.
 *   · umbral       — the calibrated zone-profile threshold.
 *   · ejecuciones  — paces/durations derived from logged training.
 *   · referencia   — a reference typical for the segment (no athlete data at all).
 *   · sin_datos    — nothing. No number is emitted.
 */
export type EvidenceSource =
  | 'carrera'
  | 'simulacion'
  | 'marca'
  | 'vo2max'
  | 'umbral'
  | 'ejecuciones'
  | 'referencia'
  | 'sin_datos';

/**
 * A capacity the athlete DEMONSTRATED, already converted into the comparison
 * basis of the segment it feeds (s/km for the run, s/500 m for an erg).
 *
 * It lives here, in the leaf, so the cross (race-transfer) can accept one without
 * importing the module that builds them (athlete/mark-projection) and vice versa.
 */
export interface MeasuredCapacity {
  value_s: number;
  source: EvidenceSource;
  /** Whole days since it was measured; null when undated. */
  age_days: number | null;
  /** Band widens one notch — see `bandForSource`. */
  weakened: boolean;
  /** The mark slug behind it, for the "what would narrow this" copy. */
  from_slug: string | null;
}

// ── 1. Ageing ────────────────────────────────────────────────────────────────

/**
 * HALF-LIFE of a piece of dated evidence, in days: how long until it counts half
 * as much as the current estimate.
 *
 * ORIGIN — this is not a new number. The model already asserted that a race stops
 * standing in as "what you'd run today" at 180 days (the old `RECENT_RACE_DAYS`
 * cliff). The same assertion, made continuous: at 180 days the race and the
 * current estimate weigh the same. Nothing about the model's stated belief
 * changed; what changed is that it no longer takes five months for the number to
 * move, and then moves all at once.
 *
 * STATUS — declared assumption, not a measurement (ley 4: "o sale de datos
 * reales, o es un supuesto escrito con su justificación"). It is exactly the kind
 * of coefficient the predicho-vs-real loop recalibrates once there are enough
 * paired snapshots (ley 5).
 */
export const EVIDENCE_HALF_LIFE_DAYS = 180;

/**
 * How much dated evidence still weighs, 1 → 0, halving every
 * EVIDENCE_HALF_LIFE_DAYS. Undated evidence (`null`) cannot be aged, so it keeps
 * full weight — we do not punish a race for a missing date.
 */
export function evidenceWeight(age_days: number | null | undefined): number {
  if (age_days == null || !Number.isFinite(age_days)) return 1;
  const age = Math.max(0, age_days);
  return Math.pow(0.5, age / EVIDENCE_HALF_LIFE_DAYS);
}

/**
 * Blend an aged observation with the current estimate: the observation's weight
 * decays, the estimate takes the rest. With no estimate to blend into there is
 * nothing to mix, so the observation stands alone — that is not optimism, it is
 * the only number there is.
 */
export function blendAgedEvidence(
  observed_s: number,
  estimated_s: number | null,
  age_days: number | null,
): { value_s: number; observed_weight: number } {
  if (estimated_s == null || !(estimated_s > 0)) {
    return { value_s: observed_s, observed_weight: 1 };
  }
  const w = evidenceWeight(age_days);
  return { value_s: observed_s * w + estimated_s * (1 - w), observed_weight: w };
}

// ── 2. Bands ─────────────────────────────────────────────────────────────────
//
// The relative half-width of a segment's band, by source. The three magnitudes
// are NOT invented for this module: they are the error scale the product already
// ships in `accuracyLabel` — the boundaries at which a prediction stops being
// "clavado", then "muy afinado", then "afinando". Reusing that scale keeps one
// statement of "how wrong is wrong" instead of two that can drift apart.

/** Accuracy (%) at or above which a prediction reads "clavado". */
export const ACCURACY_CLAVADO_MIN = 97;
/** Accuracy (%) at or above which a prediction reads "muy afinado". */
export const ACCURACY_MUY_AFINADO_MIN = 93;
/** Accuracy (%) at or above which a prediction reads "afinando". */
export const ACCURACY_AFINANDO_MIN = 85;

/** A precision boundary expressed as the relative error it tolerates. */
const bandFor = (accuracyMin: number): number => (100 - accuracyMin) / 100;

/** Narrow: the athlete literally ran this, recently. ≈ ±3%. */
export const BAND_OBSERVED = bandFor(ACCURACY_CLAVADO_MIN);
/** Medium: measured capacity, re-expressed at race distance. ≈ ±7%. */
export const BAND_MEASURED = bandFor(ACCURACY_MUY_AFINADO_MIN);
/** Wide: modelled from training, a wrist estimate, or a reference. ≈ ±15%. */
export const BAND_MODELLED = bandFor(ACCURACY_AFINANDO_MIN);

/** Base band per source, before the widenings below. */
const BAND_BY_SOURCE: Record<EvidenceSource, number> = {
  carrera: BAND_OBSERVED,
  simulacion: BAND_OBSERVED,
  marca: BAND_MEASURED,
  vo2max: BAND_MODELLED,
  umbral: BAND_MODELLED,
  ejecuciones: BAND_MODELLED,
  referencia: BAND_MODELLED,
  sin_datos: BAND_MODELLED,
};

/**
 * The band for one segment.
 *
 * Two widenings, both of them statements about what we DON'T know rather than
 * tuning knobs:
 *
 *   · `age_days` — a dated source decays from its own band toward the modelled
 *     band as it ages. A race run last week is nearly exact; the same race three
 *     years on tells us little more than a model would.
 *   · `weakened` — the caller knows something that costs confidence without
 *     changing the value: a treadmill mark standing in for street running, or a
 *     capacity with no personal race to calibrate the competition tax against.
 *     One notch, to the modelled band. Never a bespoke percentage.
 */
export function bandForSource(
  source: EvidenceSource,
  opts: { age_days?: number | null; weakened?: boolean } = {},
): number {
  const base = BAND_BY_SOURCE[source] ?? BAND_MODELLED;
  const widened = opts.weakened ? Math.max(base, BAND_MODELLED) : base;
  if (opts.age_days == null) return widened;
  // Decay from the source's own band toward the modelled band with the same
  // half-life the value itself uses — one ageing curve, two consequences.
  const w = evidenceWeight(opts.age_days);
  return widened + (1 - w) * Math.max(0, BAND_MODELLED - widened);
}

/**
 * Compose per-segment bands into the band of their sum.
 *
 * DECLARED ASSUMPTION: segment errors are treated as INDEPENDENT, so absolute
 * half-widths add in quadrature (√Σσ²) rather than linearly. Independence is the
 * standard assumption and the honest default here — the alternative, perfect
 * correlation, asserts that every segment goes wrong together, which is true of a
 * bad race day and false of model error. It understates the width of a genuinely
 * bad day; `coverage` (§07 of the spec) is what the calibration loop measures to
 * find out by how much.
 */
export function composeBands(absolute_half_widths: number[]): number {
  let sumSquares = 0;
  for (const s of absolute_half_widths) {
    if (Number.isFinite(s) && s > 0) sumSquares += s * s;
  }
  return Math.sqrt(sumSquares);
}
