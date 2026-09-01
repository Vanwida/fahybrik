// WHERE A SESSION'S INTENSITY COMES FROM, and how much of the session it covers.
//
// THE PROBLEM THIS SOLVES
// -----------------------
// `computeTss` has always known how to price a session from power, from HR or
// from RPE. Only the third has ever fired, because the one DB read that feeds it
// (`getDailyTssSeries`) selected duration and RPE and nothing else. So an athlete
// who never rates a session has no load at all — and the coach's fitness,
// fatigue and freshness are drawn from the sessions he happened to rate.
//
// The evidence to fix it is already in the tables: run segments carry
// `avg_pace_s_per_km`, most segments carry `avg_hr`, and the athlete's threshold
// pace is a resolved, versioned, PROVENANCED row in `athlete_zone_profiles`.
// What was missing is the piece that turns per-segment evidence into ONE
// intensity for the session without lying about how much of it was measured.
//
// WHY PER SEGMENT AND NOT PER SESSION
// -----------------------------------
// A hybrid session is not one thing. A HYROX simulation is eight runs and eight
// stations; a Tuesday is twenty minutes of intervals and forty of strength.
// Pricing all of it at one average would take the runs' measured pace and
// smear it over the barbell work, or take the barbell RPE and apply it to the
// runs. Each segment is priced on ITS OWN best evidence, and the session's load
// is the sum. That is also why the result reports seconds by evidence class: a
// session that is 70 % measured and 30 % declared says exactly that.
//
// THE LADDER, AND WHY IN THIS ORDER
// ---------------------------------
//   1. PACE   — for a run/erg segment with a MEASURED threshold. Pace is the
//               sharpest instrument we have for locomotion: it does not drift
//               with heat, dehydration or a bad night the way HR does.
//   2. HR     — the universal currency of a mixed session. It prices a sled push
//               and a row alike, which pace cannot.
//   3. RPE    — the athlete's own reading. Always available, always subjective.
//
// POWER is deliberately NOT wired. The only watts we store are ergometer watts
// (PM5) and the only FTP we hold is a CYCLING FTP from onboarding. Pricing a
// rowing split against a bike FTP would invent intensity as surely as the 0.65
// default did — the number would be wrong in a way nobody could see. The mode
// stays in `computeTss` for the day a bike FTP meets bike watts.
//
// THE ESTIMATED-ANCHOR RULE, INHERITED NOT REINVENTED
// ---------------------------------------------------
// `tss.ts` already refuses to price a session against an ESTIMATED threshold HR,
// because an anchor derived from a birthday would report invented load as
// measured. The exact same rule applies to pace: a threshold back-derived from a
// 5 km time is an estimate, and it does not price. Both anchors carry their
// provenance in the type, so the rule cannot be forgotten at a call site.
//
// Pure: no I/O, no DB. Everything here is arithmetic over rows someone else read.

import { intensityFactor, type TssThresholdHr } from './tss';

/** Which evidence priced a stretch of work. */
export type IntensityMode = 'power' | 'pace' | 'hr' | 'rpe';

/**
 * A threshold PACE with its provenance — never a bare number, for the same
 * reason `TssThresholdHr` is not one.
 *
 * `measured` is false when the threshold was back-derived (a 5 km time plus an
 * offset, a 2 km erg split read as if it were threshold). Those are proxies for
 * the threshold, not the threshold, and an intensity priced against a proxy is
 * an estimate wearing a measurement's clothes.
 */
export interface ThresholdPace {
  /** Seconds per the modality's unit (s/km for run, s/500m for row and ski). */
  seconds: number;
  measured: boolean;
}

/**
 * One stretch of work with whatever was measured on it. `duration_seconds` is
 * the only required field: a segment nobody measured still consumed time, and
 * that time has to be accounted for rather than quietly dropped.
 */
export interface SegmentEvidence {
  duration_seconds: number;
  /** Pace actually held, in the SAME unit as `threshold_pace`. */
  pace_seconds: number | null;
  /**
   * The threshold this segment's pace is judged against, in the segment's own
   * unit. It rides on the SEGMENT and not on the session because a hybrid
   * session mixes units: a run is seconds per kilometre and a row is seconds per
   * 500 m. One threshold for the whole session would divide a rowing split by a
   * running threshold and read a hard effort as a stroll.
   */
  threshold_pace: ThresholdPace | null;
  /** Average heart rate over the segment. */
  avg_hr: number | null;
  /**
   * Net gradient, percent. A steep segment is not priced by pace — the same rule
   * the running verdict already applies (`GRADIENT_RETIRES_PACE_PCT`): uphill
   * pace is slow for reasons that have nothing to do with how hard it was. Null
   * means unknown, which is treated as flat (we do not invent a hill).
   */
  gradient_pct: number | null;
}

export interface SessionEvidence {
  /** Total session duration. Segments rarely add up to it; the remainder is real. */
  duration_seconds: number;
  rpe: number | null;
  segments: readonly SegmentEvidence[];
  /**
   * Threshold HR, with the provenance flag `tss.ts` already honours. This one IS
   * per session: a heartbeat means the same thing whatever the athlete is doing,
   * which is exactly why HR is the currency that prices a mixed session.
   */
  lthr: TssThresholdHr | null;
}

export interface PricingOptions {
  /**
   * Gradient (percent) at or above which pace stops pricing. Coach method — the
   * SAME `gradient_retires_pace_pct` the running verdict uses, passed in rather
   * than restated so one coach cannot have two definitions of "steep".
   */
  gradient_retires_pace_pct: number;
}

/**
 * What a session cost, and on what evidence.
 *
 * The three second counts are the honesty of the number. They always sum to
 * `duration_seconds`, so a caller can never quietly lose time:
 *   measured  — priced by pace or HR (something an instrument recorded)
 *   declared  — priced by RPE (something the athlete said)
 *   unpriced  — nobody measured it and nobody rated it
 */
export interface SessionPrice {
  /** Null only when NOTHING could be priced. Zero-duration sessions cost 0. */
  tss: number | null;
  /** The evidence that priced the most seconds. Null when nothing was priced. */
  mode: IntensityMode | null;
  measured_seconds: number;
  declared_seconds: number;
  unpriced_seconds: number;
}

const SECONDS_PER_HOUR = 3600;

/**
 * TSS for one stretch: an hour at threshold (IF 1.0) is 100.
 * Kept private and used by every rung, so no rung can invent its own scale.
 */
function stretchTss(seconds: number, intensityFactor: number): number {
  return Math.max(0, (seconds / SECONDS_PER_HOUR) * intensityFactor * intensityFactor * 100);
}

function usableNumber(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v) && v > 0;
}

/**
 * Intensity from pace. Threshold over actual: running FASTER than threshold
 * means fewer seconds per kilometre, so the ratio rises above 1 — which is the
 * direction intensity should move.
 *
 * Null when the anchor is missing or estimated, when no pace was recorded, or
 * when the ground was steep enough that pace stopped meaning effort.
 */
export function paceIntensity(segment: SegmentEvidence, options: PricingOptions): number | null {
  const threshold = segment.threshold_pace;
  if (threshold == null || !threshold.measured || !usableNumber(threshold.seconds)) return null;
  if (!usableNumber(segment.pace_seconds)) return null;
  const gradient = segment.gradient_pct;
  if (gradient != null && Number.isFinite(gradient)) {
    if (Math.abs(gradient) >= options.gradient_retires_pace_pct) return null;
  }
  return threshold.seconds / segment.pace_seconds;
}

/**
 * Intensity from heart rate, against a MEASURED threshold HR. Same formula
 * `tss.ts::ifFromHr` already used (`avg_hr / lthr`), applied per segment instead
 * of once over a whole session — so an interval workout is no longer read as its
 * lukewarm average.
 */
export function hrIntensity(segment: SegmentEvidence, lthr: TssThresholdHr | null): number | null {
  if (lthr == null || lthr.estimated || !usableNumber(lthr.bpm)) return null;
  if (!usableNumber(segment.avg_hr)) return null;
  return segment.avg_hr / lthr.bpm;
}

/**
 * RPE → intensity, through the very same `intensityFactor` the engine already
 * prices with. Imported, never restated: a second RPE curve here would let the
 * same session cost two different amounts depending on which rung priced it.
 */
function rpeIntensity(rpe: number): number | null {
  return intensityFactor({ duration_seconds: SECONDS_PER_HOUR, rpe });
}

/**
 * Price one session on the best evidence available for each of its parts.
 *
 * WHAT HAPPENS TO THE REMAINDER. Segments almost never add up to the session's
 * duration — there is warm-up, rest between sets, the walk to the rig. That
 * remainder is priced by RPE when there is one, which is exactly what the engine
 * did for the WHOLE session until today. So no athlete loses coverage by this
 * change: a fully-rated session with no measured segment prices identically to
 * before, and every measured segment can only move it toward evidence.
 */
export function priceSession(evidence: SessionEvidence, options: PricingOptions): SessionPrice {
  const total = Number.isFinite(evidence.duration_seconds) ? Math.max(0, evidence.duration_seconds) : 0;
  if (total <= 0) {
    return { tss: 0, mode: null, measured_seconds: 0, declared_seconds: 0, unpriced_seconds: 0 };
  }

  const rpeIf = evidence.rpe == null ? null : rpeIntensity(evidence.rpe);

  let tss = 0;
  let anyPriced = false;
  let paceSeconds = 0;
  let hrSeconds = 0;
  let segmentSeconds = 0;

  for (const segment of evidence.segments) {
    const seconds = Number.isFinite(segment.duration_seconds)
      ? Math.max(0, segment.duration_seconds)
      : 0;
    if (seconds <= 0) continue;
    // A segment can never claim more time than the session it belongs to.
    const usable = Math.min(seconds, Math.max(0, total - segmentSeconds));
    if (usable <= 0) break;
    segmentSeconds += usable;

    const byPace = paceIntensity(segment, options);
    if (byPace != null) {
      tss += stretchTss(usable, byPace);
      paceSeconds += usable;
      anyPriced = true;
      continue;
    }
    const byHr = hrIntensity(segment, evidence.lthr);
    if (byHr != null) {
      tss += stretchTss(usable, byHr);
      hrSeconds += usable;
      anyPriced = true;
      continue;
    }
    // No instrument on this segment: it falls into the remainder, where RPE
    // gets its chance. Nothing is dropped.
    segmentSeconds -= usable;
  }

  const remainder = Math.max(0, total - segmentSeconds);
  let declared = 0;
  if (remainder > 0 && rpeIf != null) {
    tss += stretchTss(remainder, rpeIf);
    declared = remainder;
    anyPriced = true;
  }

  const measured = paceSeconds + hrSeconds;
  const unpriced = Math.max(0, total - measured - declared);

  if (!anyPriced) {
    return { tss: null, mode: null, measured_seconds: 0, declared_seconds: 0, unpriced_seconds: total };
  }

  // The dominant mode is the one that priced the most time — what the session
  // was mostly judged on, which is what a coach means when he asks "measured?".
  let mode: IntensityMode = 'rpe';
  let best = declared;
  if (hrSeconds > best) {
    mode = 'hr';
    best = hrSeconds;
  }
  if (paceSeconds > best) {
    mode = 'pace';
  }

  return {
    tss,
    mode,
    measured_seconds: measured,
    declared_seconds: declared,
    unpriced_seconds: unpriced,
  };
}
