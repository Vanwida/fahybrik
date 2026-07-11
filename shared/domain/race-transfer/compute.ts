// @fahybrid/shared/domain/race-transfer — the CROSS computation (pure, no I/O).
//
// `computeRaceTransfer(input)` turns fetched rows into the per-effort comparison
// of TRAINED vs COMPETED. It owns the domain rules:
//
//   1. Unit normalization — a race erg split is 1000 m sustained; the trained erg
//      pace + threshold are per 500 m, so the race split is halved before it is
//      compared. Running is per km on both sides. A functional station compares
//      raw seconds (race split vs practice duration).
//   2. Fresh vs fatigued — each training effort is classified from its block
//      context + the work done before it (FRESH_PRIOR_WORK_MAX_S). A HYROX
//      simulation is always fatigued. Efforts that cannot be classified honestly
//      (unknown prior work, mid-session) are dropped, not guessed.
//   3. Evidence tiers, best first — `observado` (real efforts) → `estimado`
//      (zone-profile threshold, run/ski/row only) → `sin_datos`.
//   4. The transfer delta — how much slower the race is than the trained level
//      (positive = time lost). Null whenever a side is missing (never a fake 0).

import {
  ERG_PACE_UNIT_METERS,
  ERG_RACE_SPLIT_METERS,
  FATIGUE_CONTEXT_FORMAT,
  FRESH_CONTEXT_FORMATS,
  FRESH_PRIOR_WORK_MAX_S,
  type ObservedEffort,
  type RaceTransferInput,
  type RaceTransferResult,
  type StationKind,
  type StationTransfer,
  type StationTransferInput,
  type TrainedEvidence,
  type TransferUnit,
} from './types';

/** A race erg split (1000 m) → per-500 m pace, to compare with the trained pace. */
const ERG_SPLIT_DIVISOR = ERG_RACE_SPLIT_METERS / ERG_PACE_UNIT_METERS; // = 2

/** The comparison unit for a station kind. */
function unitFor(kind: StationKind): TransferUnit {
  if (kind === 'run') return 'per_km';
  if (kind === 'ski' || kind === 'row') return 'per_500m';
  return 'seconds';
}

/** Arithmetic mean, or null for an empty list. */
function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Paced modalities (a pace comparison) vs a functional station (a duration). */
function isPaced(kind: StationKind): boolean {
  return kind !== 'functional';
}

/**
 * Reduce a bucket of training efforts to its trained reference:
 *   · paced (run/ski/row) → the BEST effort (fastest = min). The mean would fold
 *     in easy Z2 volume, which is training LOAD, not capacity.
 *   · functional station    → the MEAN. Station practice is quality work end to
 *     end, so its average is a fair capacity read.
 */
function aggregateTrained(values: number[], kind: StationKind): number | null {
  if (values.length === 0) return null;
  return isPaced(kind) ? Math.min(...values) : mean(values);
}

/**
 * Classify one training effort as fresh, fatigued, or unclassifiable.
 *   · fatigado — a HYROX simulation, OR ≥ FRESH_PRIOR_WORK_MAX_S of prior work.
 *   · fresco   — a fresh-eligible block (steady / intervals / sets) AND either
 *                < FRESH_PRIOR_WORK_MAX_S of prior work, or the session's first
 *                effort (position 0) when prior work wasn't measured.
 *   · null     — anything else (e.g. unknown prior work mid-session): we will not
 *                pretend to know if it was fresh or fatigued, so it is dropped.
 */
export function classifyEffort(e: ObservedEffort): 'fresco' | 'fatigado' | null {
  if (e.context_format === FATIGUE_CONTEXT_FORMAT) return 'fatigado';
  if (e.prior_work_s != null && e.prior_work_s >= FRESH_PRIOR_WORK_MAX_S) return 'fatigado';

  const freshContext = e.context_format != null && FRESH_CONTEXT_FORMATS.includes(e.context_format);
  const freshLoad =
    (e.prior_work_s != null && e.prior_work_s < FRESH_PRIOR_WORK_MAX_S) ||
    (e.prior_work_s == null && e.position === 0);
  if (freshContext && freshLoad) return 'fresco';
  return null;
}

const SIN_DATOS: TrainedEvidence = {
  tier: 'sin_datos',
  value_s: null,
  unit: null,
  contexto: null,
  n_efforts: 0,
};

/**
 * Build the trained side for one station from its efforts (+ optional threshold).
 *
 * The HEADLINE reference (value_s → the transfer delta) differs by kind:
 *   · paced (run/ski/row): the calibrated zone-profile THRESHOLD first (strong,
 *     test-derived capacity → tier 'estimado'); else the BEST fresh effort (tier
 *     'observado'); else a gate. The mean is never the headline for a pace.
 *   · functional station: the observed practice mean (fresh, else fatigued).
 * Either way the observed fresco/fatigado efforts + their count always surface as
 * CONTEXT (contexto/n_efforts) whenever a headline exists — they inform, they
 * don't fix the number.
 */
function trainedEvidence(st: StationTransferInput): TrainedEvidence {
  const unit = unitFor(st.kind);
  const fresco: number[] = [];
  const fatigado: number[] = [];

  for (const e of st.observed) {
    if (!(e.value_s > 0)) continue; // a 0/negative pace or duration is not a real effort
    const c = classifyEffort(e);
    if (c === 'fresco') fresco.push(e.value_s);
    else if (c === 'fatigado') fatigado.push(e.value_s);
  }

  const nClassified = fresco.length + fatigado.length;
  const fresco_s = aggregateTrained(fresco, st.kind);
  const fatigado_s = aggregateTrained(fatigado, st.kind);
  const contexto = nClassified > 0 ? { fresco_s, fatigado_s } : null;

  if (isPaced(st.kind)) {
    if (st.threshold_s != null && st.threshold_s > 0) {
      return { tier: 'estimado', value_s: st.threshold_s, unit, contexto, n_efforts: nClassified };
    }
    if (fresco_s != null) {
      return { tier: 'observado', value_s: fresco_s, unit, contexto, n_efforts: nClassified };
    }
    // No threshold + no fresh capacity → gate (fatigued-only can't anchor capacity).
    return SIN_DATOS;
  }

  // Functional station: its practice is quality work, so the fresh mean is a fair
  // reference (the fatigued mean when there's no fresh practice).
  if (nClassified > 0) {
    return { tier: 'observado', value_s: fresco_s ?? fatigado_s, unit, contexto, n_efforts: nClassified };
  }
  return SIN_DATOS;
}

/** The competed value for one station, in the comparison basis (or null). */
function raceValue(st: StationTransferInput, race: RaceTransferInput['race']): number | null {
  if (!race) return null;
  if (st.kind === 'run') {
    const laps = race.run_splits.filter((n) => Number.isFinite(n) && n > 0);
    return mean(laps); // per_km already
  }
  if (st.race_index == null) return null;
  const split = race.station_splits.find((s) => s.index === st.race_index);
  const secs = split?.seconds;
  if (secs == null || !(secs > 0)) return null;
  if (st.kind === 'ski' || st.kind === 'row') return secs / ERG_SPLIT_DIVISOR; // 1000 m → per_500m
  return secs; // functional: raw station seconds
}

/**
 * Compute the training × race cross. Pure: every value is derived from `input`;
 * nothing is fetched, nothing is fabricated (missing sides → null, never a 0).
 */
export function computeRaceTransfer(input: RaceTransferInput): RaceTransferResult {
  const { race, only_doubles, stations } = input;

  const out: StationTransfer[] = stations.map((st) => {
    const trained = trainedEvidence(st);
    const race_seconds = raceValue(st, race);
    const transfer_delta_pct =
      race_seconds != null && trained.value_s != null && trained.value_s > 0
        ? Math.round(((race_seconds - trained.value_s) / trained.value_s) * 100)
        : null;

    return {
      index: st.index,
      slug: st.slug,
      label: st.label,
      kind: st.kind,
      unit: unitFor(st.kind),
      race_seconds,
      race_date: race?.date ?? null,
      race_name: race?.name ?? null,
      trained,
      transfer_delta_pct,
    };
  });

  const availability = race ? 'ok' : only_doubles ? 'only_doubles' : 'no_singles_race';

  return {
    availability,
    race_id: race?.id ?? null,
    race_name: race?.name ?? null,
    race_date: race?.date ?? null,
    stations: out,
  };
}
