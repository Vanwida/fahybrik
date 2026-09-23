// RACE READINESS — the coach-grade 0…100 composite shown on the roster, on the
// athlete's own page and as the disposition bar of the Rendimiento tab.
// Coach-grade rather than research-grade on purpose: it is a triage number, not a
// physiological claim.
//
// It lives here because it was written TWICE (roster and deep-dive) and the two
// copies had already drifted apart: one returned null when there was no signal,
// the other always returned a number and let a missing TSB fall through as 0,
// which is 20 of the 40 freshness points handed to an athlete nobody measured.
// The same athlete could therefore read differently on the two screens. Having
// two formulas is what produced every divergence this codebase has had to undo.
//
// A THIRD copy lived in the Rendimiento tab and was worse still: its `tsb` column
// was fed a single day's TSS (`avg(load_score)`), so it read a LOAD where the
// formula expected a BALANCE, and it awarded 20 / 20 / 12 / 5 points out of thin
// air whenever a reading was missing — the HRV band unconditionally, without ever
// looking at an HRV row. That file now calls this one.
//
// The four bands, their ceilings and their Spanish labels are exported because
// the screens render the split: a component that keeps its own copy of "VFC vale
// 12" is how the bar came to be drawn out of 92 points while labelled "/ 100".

import { adherencePct } from '../adherence/completion';
import { hrvDeltaMs, type HrvSample } from '../biometrics/hrv-baseline';
import { summarizeLoad, type DailyTss } from '../training-load/banister';
import { readLoadCoverage, type LoadCoverage } from '../training-load/coverage';
import {
  DEFAULT_COACH_THRESHOLDS,
  normalizedWeights,
  type CoachThresholds,
} from './signal-thresholds';

/** The four scored bands. Order = the order every surface renders them in. */
export const RACE_READINESS_BANDS = ['freshness', 'compliance', 'hrv', 'activity'] as const;
export type RaceReadinessBand = (typeof RACE_READINESS_BANDS)[number];

/**
 * The coach's METHOD for the index (HARD RULE Nº0 — «qué pesos lleva un índice de
 * disposición» is the textbook example; migration 0256): how the 100 points are
 * split across the four bands, and the TSB window the freshness band spans. The
 * weights are relative in the coach's row and normalised here, so the ceilings
 * always add up to 100. A band with ceiling 0 does not score AND is not missed:
 * a coach who sets VFC to 0 gets an index for athletes without a watch.
 */
export type RaceReadinessMethod = {
  band_max: Record<RaceReadinessBand, number>;
  /** Freshness scores 0 at TSB −span and full at +span. */
  tsb_span: number;
};

/** The method of a coach, from their effective thresholds. */
export function raceReadinessMethodOf(t: CoachThresholds): RaceReadinessMethod {
  // `thresholdIssues` refuses an all-zero group; if one ever arrives, the default split.
  const w =
    normalizedWeights(t, 'race_readiness') ??
    normalizedWeights(DEFAULT_COACH_THRESHOLDS, 'race_readiness')!;
  return {
    band_max: {
      freshness: w.race_readiness_weight_freshness * 100,
      compliance: w.race_readiness_weight_adherence * 100,
      hrv: w.race_readiness_weight_hrv * 100,
      activity: w.race_readiness_weight_activity * 100,
    },
    tsb_span: t.race_readiness_tsb_span,
  };
}

/** The system's method (a coach who touches nothing): 40 / 30 / 20 / 10, TSB ±10. */
export const DEFAULT_RACE_READINESS_METHOD: RaceReadinessMethod =
  raceReadinessMethodOf(DEFAULT_COACH_THRESHOLDS);

/** Point budget of the DEFAULT method — the four ceilings add up to 100. */
export const RACE_READINESS_BAND_MAX: Record<RaceReadinessBand, number> =
  DEFAULT_RACE_READINESS_METHOD.band_max;

/** Athlete-facing Spanish, owned here so two screens cannot name a band twice. */
export const RACE_READINESS_BAND_LABEL_ES: Record<RaceReadinessBand, string> = {
  freshness: 'Frescura',
  compliance: 'Adherencia',
  hrv: 'VFC',
  activity: 'Actividad',
};


/**
 * There is NO neutral credit. A band with nothing behind it does not score a
 * middle value — it withdraws the whole reading.
 *
 * This used to be `COMPLIANCE_UNKNOWN_PTS = 20` (of 30) and `HRV_UNKNOWN_PTS =
 * 10` (of 20): the "~50 baseline for a data-less athlete" the file above says it
 * removed, chopped up and handed out band by band. 0,66 and 0,5 are the same
 * invention as the 0,65 and the 0,5 that docs/DECISIONS.md (28-jul) struck out —
 * "ni 1, ni 0,65, ni 0,5" — and they were worth up to 30 of the 100 points. It
 * is the same argument coverage.ts already makes about TSB: a composite that
 * could be wrong by 30 points in an unknown direction is not a score.
 *
 * The scale is unchanged, so a number that IS given still means what it meant.
 */

/**
 * Days of activity that fill the activity band (mechanism: the band saturates at
 * ~7 days of a 7-day window whatever its weight — 1,5 of 10 points per day).
 */
const ACTIVITY_FULL_DAYS = 10 / 1.5;
/** HRV band: each ms of delta moves this share of the band (1 point of 20). */
const HRV_BAND_PER_MS = 1 / 20;

/** Trailing window of the compliance band, in days. */
export const READINESS_COMPLIANCE_DAYS = 7;
/** Trailing window of the activity band, in days. */
export const READINESS_ACTIVITY_DAYS = 7;
/**
 * Warm-up + window handed to the Banister model for one reading. Matches the
 * single-point callers (`getLoadSummary`, the athlete ficha) exactly, so the
 * newest point of a history and the number on the ficha are the same number and
 * not two answers 42 days of EWMA apart.
 */
export const READINESS_LOAD_WINDOW_DAYS = 90;

export type RaceReadinessInput = {
  /** Freshness (CTL − ATL). Null when there is no load reading to speak of. */
  tsb: number | null;
  /** 0…100 adherence over the last 7 days; null when nothing was scheduled. */
  compliance_pct: number | null;
  /** HRV vs baseline, ms. Null when there is no baseline. */
  hrv_delta_ms: number | null;
  /** Days with executed work in the last 7 (saturates the band at ≥ 7). */
  active_days_7d: number;
  /** How much of the executed work the TSB above actually saw. */
  load_coverage: LoadCoverage;
};

/** Points per band. They are integers and they sum to `score`, always. */
export type RaceReadinessBands = Record<RaceReadinessBand, number>;

export type RaceReadinessReading = {
  /** 0…100. Equal to the sum of `bands`, by construction. */
  score: number;
  /** Every one of them measured. There is no other kind. */
  bands: RaceReadinessBands;
};

/** Which input had nothing behind it. */
export type RaceReadinessMissing = 'load' | 'compliance' | 'hrv';

/** Why there is no reading, in the coach's language, with a way out. */
export type RaceReadinessGap = {
  reason: 'no_signal' | 'partial_coverage' | 'missing_inputs';
  /** Empty only on `partial_coverage`, where the hole is in the load itself. */
  missing: RaceReadinessMissing[];
  /** One sentence naming what is missing. */
  note_es: string;
  /** What the coach can do about it. Null when there is nothing to do but wait. */
  action_es: string | null;
};

/** A reading, or the reason there isn't one. Never both, never neither. */
export type RaceReadinessResult =
  | { reading: RaceReadinessReading; gap: null }
  | { reading: null; gap: RaceReadinessGap };

/** What the coach does to make each missing input exist. */
const MISSING_LABEL_ES: Record<RaceReadinessMissing, string> = {
  load: 'la carga',
  compliance: 'la adherencia',
  hrv: 'la variabilidad',
};
const MISSING_ACTION_ES: Record<RaceReadinessMissing, string> = {
  load: 'Necesita entrenos registrados y valorados.',
  compliance: 'Prográmale la semana: sin sesiones asignadas no hay adherencia que medir.',
  hrv: 'Necesita el reloj sincronizando: la referencia de variabilidad tarda unas dos semanas.',
};

/**
 * The composite, or the reason it cannot be given.
 *
 * Null means "not scoreable", never "zero readiness". Three ways to get there,
 * and they are all the same rule — a band with nothing behind it does not score:
 *
 *  • No signal at all. We do NOT invent a ~50 baseline for a data-less athlete.
 *  • A load reading with a hole in it. TSB is undecidable in BOTH directions
 *    under partial coverage (shared/domain/training-load/coverage.ts), so the
 *    composite would be uncertain by up to 40 points — which is not a score.
 *  • Any band unmeasured. Adherence is 30 of the 100 points and variability is
 *    20: handing either a "neutral" middle value makes the total wrong by up to
 *    that much, in a direction nobody can name. That is the same objection
 *    coverage.ts raises against TSB, and it does not get weaker because the band
 *    is smaller.
 */
export function readRaceReadiness(
  input: RaceReadinessInput,
  method: RaceReadinessMethod = DEFAULT_RACE_READINESS_METHOD,
): RaceReadinessResult {
  const max = method.band_max;
  const noSignal =
    input.active_days_7d === 0 && input.hrv_delta_ms == null && input.compliance_pct == null;
  if (noSignal) {
    return {
      reading: null,
      gap: {
        reason: 'no_signal',
        missing: ['load', 'compliance', 'hrv'],
        note_es:
          'Sin entrenos registrados, sin adherencia y sin variabilidad: todavía no hay nada que leer.',
        action_es: 'En cuanto registre un entreno y lo valore, la barra aparece sola.',
      },
    };
  }
  if (max.freshness > 0 && input.tsb != null && !input.load_coverage.allows_verdict) {
    return {
      reading: null,
      gap: {
        reason: 'partial_coverage',
        missing: [],
        note_es:
          input.load_coverage.note_es ??
          'Parte de la carga ejecutada no está valorada, así que la frescura no se puede situar.',
        action_es: input.load_coverage.action_es,
      },
    };
  }

  // Only a band that scores can be missing: a band the coach weighs 0 is not asked for.
  const missing: RaceReadinessMissing[] = [];
  if (max.freshness > 0 && input.tsb == null) missing.push('load');
  if (max.compliance > 0 && input.compliance_pct == null) missing.push('compliance');
  if (max.hrv > 0 && input.hrv_delta_ms == null) missing.push('hrv');
  if (missing.length > 0) {
    return { reading: null, gap: missingInputsGap(missing, method) };
  }

  const span = 2 * method.tsb_span;
  const freshness =
    max.freshness > 0
      ? clamp(((input.tsb! + method.tsb_span) / span) * max.freshness, 0, max.freshness)
      : 0;
  const compliance = max.compliance > 0 ? (input.compliance_pct! / 100) * max.compliance : 0;
  // A delta of 0 ms means "exactly as usual", which sits mid-band; each ms of
  // suppression or rebound moves it a twentieth of the band either way (one point
  // of the default 20). This is a MEASUREMENT of the mid-band, not the old
  // unconditional 10 that never looked at a row.
  const hrv =
    max.hrv > 0 ? clamp(max.hrv / 2 + input.hrv_delta_ms! * max.hrv * HRV_BAND_PER_MS, 0, max.hrv) : 0;
  const activity = Math.min(max.activity, (input.active_days_7d / ACTIVITY_FULL_DAYS) * max.activity);

  // Round the BANDS, then sum — so the four numbers printed under the bar always
  // add up to the headline. Rounding the total instead let the split disagree
  // with the score by a point, which on a screen reads as a bug.
  const bands: RaceReadinessBands = {
    freshness: Math.round(freshness),
    compliance: Math.round(compliance),
    hrv: Math.round(hrv),
    activity: Math.round(activity),
  };
  const score = RACE_READINESS_BANDS.reduce((s, b) => s + bands[b], 0);

  return { reading: { score, bands }, gap: null };
}

function missingInputsGap(missing: RaceReadinessMissing[], method: RaceReadinessMethod): RaceReadinessGap {
  const names = missing.map((m) => MISSING_LABEL_ES[m]);
  const list =
    names.length === 1
      ? names[0]!
      : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
  return {
    reason: 'missing_inputs',
    missing,
    note_es:
      names.length === 1
        ? `Falta ${list}: sin ella el índice saldría con hasta ${missingWeight(missing, method)} puntos de incertidumbre, así que no se da.`
        : `Faltan ${list}: sin ellas el índice saldría con hasta ${missingWeight(missing, method)} puntos de incertidumbre, así que no se da.`,
    // Heaviest band first (they are pushed in band order, which is also weight
    // order): fixing the 40-point hole is what unblocks the reading soonest.
    action_es: MISSING_ACTION_ES[missing[0]!],
  };
}

/** How many of the 100 points the missing bands are worth. */
function missingWeight(missing: RaceReadinessMissing[], method: RaceReadinessMethod): number {
  const weight: Record<RaceReadinessMissing, number> = {
    load: method.band_max.freshness,
    compliance: method.band_max.compliance,
    hrv: method.band_max.hrv,
  };
  return Math.round(missing.reduce((s, m) => s + weight[m], 0));
}

/** The composite as a bare number. Null = not scoreable, never zero readiness. */
export function estimateRaceReadiness(
  input: RaceReadinessInput,
  method: RaceReadinessMethod = DEFAULT_RACE_READINESS_METHOD,
): number | null {
  return readRaceReadiness(input, method).reading?.score ?? null;
}

// ── The 90-day history ───────────────────────────────────────────────────────
// Built here, next to the formula, so the newest point of the trend and the
// number on the ficha cannot come from two different definitions of "readiness".

/** Scheduled / completed assignments on one day, pauses already excluded. */
export type DailyAssignmentCount = {
  /** YYYY-MM-DD */
  date: string;
  scheduled: number;
  completed: number;
};

/** One sampled day of the trend. `reading` and `gap` follow the same contract. */
export type RaceReadinessPoint = {
  /** YYYY-MM-DD */
  iso_date: string;
} & RaceReadinessResult;

/** A day of the trend to compute: its date, and the instant it is read at. */
export type RaceReadinessSample = {
  /** YYYY-MM-DD — must exist in `series`. */
  iso_date: string;
  /** The instant the HRV windows are measured back from. */
  at: Date;
};

/**
 * The composite for every sampled day, from series the caller read ONCE.
 *
 * Pure: the three inputs are plain series, so the whole 90-day trend is testable
 * without a database — which matters, because the version this replaces issued
 * thirty round-trips whose SQL nobody could run in a test, and which in
 * production threw on every one of them against a table that does not exist.
 *
 * `series` must extend {@link READINESS_LOAD_WINDOW_DAYS} days BEFORE the first
 * sampled day: each point is read over its own trailing 90-day window, so an old
 * point is not computed off a colder EWMA than a recent one.
 */
export function buildRaceReadinessHistory(params: {
  series: ReadonlyArray<DailyTss>;
  assignments: ReadonlyArray<DailyAssignmentCount>;
  hrv: ReadonlyArray<HrvSample>;
  /** Ascending. Samples whose day is outside `series` are skipped, not invented. */
  samples: ReadonlyArray<RaceReadinessSample>;
  /** The coach's method (defaults: 40/30/20/10, TSB ±10). */
  method?: RaceReadinessMethod;
}): RaceReadinessPoint[] {
  const indexByDate = new Map(params.series.map((p, i) => [p.date, i]));
  const out: RaceReadinessPoint[] = [];

  for (const { iso_date, at } of params.samples) {
    const idx = indexByDate.get(iso_date);
    if (idx == null) continue;

    const window = params.series.slice(Math.max(0, idx - (READINESS_LOAD_WINDOW_DAYS - 1)), idx + 1);
    const summary = summarizeLoad(window);
    const coverage = readLoadCoverage(summary);

    const activityWindow = params.series.slice(
      Math.max(0, idx - (READINESS_ACTIVITY_DAYS - 1)),
      idx + 1,
    );
    const active_days_7d = activityWindow.filter(
      (p) => (p.known_seconds ?? 0) + (p.unknown_seconds ?? 0) > 0,
    ).length;

    const due = params.assignments.filter(
      (a) => a.date <= iso_date && a.date >= shiftIso(iso_date, -READINESS_COMPLIANCE_DAYS),
    );
    const scheduled = due.reduce((s, a) => s + a.scheduled, 0);
    const completed = due.reduce((s, a) => s + a.completed, 0);

    const result = readRaceReadiness({
      tsb: summary.tsb,
      compliance_pct: adherencePct(scheduled, completed),
      hrv_delta_ms: hrvDeltaMs(params.hrv, at),
      active_days_7d,
      load_coverage: coverage,
    }, params.method);
    out.push({ iso_date, ...result });
  }

  return out;
}

/** `YYYY-MM-DD` shifted by whole days, in UTC. */
function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
