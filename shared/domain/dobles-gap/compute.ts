// @fahybrid/shared/domain/dobles-gap — the orchestration (pure, no I/O).
//
// computeDoblesGap(input) joins the two athletes' SOLO predictions, the pair's
// reparto (carriers) and the pair's goal into a per-segment read:
//
//   PAIR PREDICTION per segment, by carrier
//     · together (runs + roxzone) — both race it in full, so the SLOWER governs:
//       max(self, partner). "Vais juntos, manda el más lento."
//     · self / partner — one athlete carries the whole station: their solo.
//     · split — the station is shared: share·self + (1−share)·partner. In doubles
//       the two never work a station simultaneously (they alternate / hand off),
//       so the shared time is the sum of each one's portion, weighted by share.
//   Any REQUIRED side with no prediction (sin_datos) makes the segment sin_datos;
//   its pair prediction is then HELD AT BUDGET (identical to the singles total
//   convention) so the predicted total is always a real, gap-readable number.
//
//   BUDGET (goal decomposed), fraction source best first:
//     1. the DOUBLES cohort near the goal (≥ MIN_COHORT_RACES) — real pairs;
//     2. else the reader's own last complete DOUBLES race;
//     3. else the FASTER athlete's own singles race (shape reference);
//     4. else the pair's OWN predicted proportions ('prediccion');
//     5. else an even split ('reparto_uniforme') — the honest last resort.
//   Always closed to the goal by the reused largest-remainder apportionment.
//   goal === null → no goal to decompose: budget_s = the pair prediction itself,
//   so the bar keeps its scale and the app shows "ponle objetivo".

import { largestRemainder, raceFractions, MIN_COHORT_RACES } from '../goal-gap';
import type { PredictionTier } from '../goal-gap';
import type {
  DoblesAvailability,
  DoblesBudgetSource,
  DoblesGapInput,
  DoblesGapResult,
  DoblesSegmentCarrier,
  DoblesSegmentResult,
  SoloPrediction,
} from './types';

/** Worst (least trustworthy) tier of a set — sin_datos dominates estimado
 *  dominates observado. Empty set → observado (never happens for a real segment). */
const TIER_RANK: Record<PredictionTier, number> = { observado: 0, estimado: 1, sin_datos: 2 };
function worstTier(tiers: PredictionTier[]): PredictionTier {
  return tiers.reduce<PredictionTier>((w, t) => (TIER_RANK[t] > TIER_RANK[w] ? t : w), 'observado');
}

/** The reader-centric carrier + share for one segment. */
function segmentCarrier(
  input: DoblesGapInput,
  segIndex: number,
): { carrier: DoblesSegmentCarrier; self_share: number | null } {
  const seg = input.segments[segIndex]!;
  if (seg.kind === 'run' || seg.kind === 'roxzone') return { carrier: 'together', self_share: null };
  // Station: the reparto, defaulting a station absent from the pair's simulation
  // to an even 50/50 split (documented — mirrors the coach's own default).
  const sc = seg.station_index != null ? input.carriers.get(seg.station_index) : undefined;
  if (!sc) return { carrier: 'split', self_share: 0.5 };
  if (sc.carrier === 'self') return { carrier: 'self', self_share: 1 };
  if (sc.carrier === 'partner') return { carrier: 'partner', self_share: 0 };
  return { carrier: 'split', self_share: sc.self_share };
}

/**
 * The pair's seconds for a SHARED station: the two never work it at the same
 * time (they alternate / hand off), so the cost is each one's portion added up,
 * weighted by the reader's share.
 *
 * THIS IS THE ONE DEFINITION OF THE SPLIT RULE. The app mirrors it locally
 * (`DoblesRepartoMath.stationPairPredicted`) because the reparto slider has to
 * preview the effect while the athlete drags it, and a round-trip per step is
 * not an option. Both sides are pinned to the same table of cases —
 * `station-split-cases.json` — so a divergence fails a test in one of the two
 * languages instead of showing the athlete two different numbers.
 *
 * `share` is CLAMPED to 0..1: a share is a fraction of one station, and that is
 * already the rule at the write boundary (dobles-simulation's Zod bound +
 * normalizeStationSplit). Clamping here too means the rule survives wherever the
 * value comes from, and matches the app's mirror exactly.
 */
export function splitStationPrediction(share: number, self_s: number, partner_s: number): number {
  const s = Math.min(1, Math.max(0, share));
  return Math.round(s * self_s + (1 - s) * partner_s);
}

/** The raw pair prediction for a segment, or null when a required side is
 *  sin_datos (→ the caller holds it at budget). `share` is the reader's share. */
function rawPairPrediction(
  carrier: DoblesSegmentCarrier,
  share: number | null,
  self: SoloPrediction,
  partner: SoloPrediction,
): { value: number | null; tier: PredictionTier } {
  const required: SoloPrediction[] =
    carrier === 'self' ? [self] : carrier === 'partner' ? [partner] : [self, partner];
  const tier = worstTier(required.map((s) => s.tier));
  if (tier === 'sin_datos') return { value: null, tier };

  // Every required side is observado/estimado ⇒ its predicted_s is non-null.
  const s = self.predicted_s as number;
  const p = partner.predicted_s as number;
  let value: number;
  if (carrier === 'together') value = Math.max(s, p);
  else if (carrier === 'self') value = s;
  else if (carrier === 'partner') value = p;
  else value = splitStationPrediction(share ?? 0.5, s, p);
  return { value, tier };
}

/** The per-segment budget fractions + their source, cohort-doubles first. */
function chooseFractions(
  input: DoblesGapInput,
  rawPredicted: Array<number | null>,
): { fractions: number[]; source: DoblesBudgetSource } {
  const { segments } = input;

  if (input.cohort_doubles.length >= MIN_COHORT_RACES) {
    const per = input.cohort_doubles.map((r) => raceFractions(segments, r));
    const mean = segments.map((_, i) => per.reduce((a, r) => a + (r[i] ?? 0), 0) / per.length);
    return { fractions: mean, source: 'cohorte_dobles' };
  }
  if (input.own_doubles) {
    return { fractions: raceFractions(segments, input.own_doubles), source: 'tu_dobles' };
  }
  if (input.faster_singles) {
    return { fractions: raceFractions(segments, input.faster_singles), source: 'singles_referencia' };
  }
  // No race history to shape the budget: fall to the pair's OWN predicted split.
  const sum = rawPredicted.reduce<number>((a, v) => a + (v ?? 0), 0);
  if (sum > 0) {
    return { fractions: rawPredicted.map((v) => (v ?? 0) / sum), source: 'prediccion' };
  }
  // Nothing at all — an even split, flagged honestly.
  return { fractions: segments.map(() => 1 / segments.length), source: 'reparto_uniforme' };
}

function availabilityOf(tiers: PredictionTier[]): DoblesAvailability {
  if (tiers.every((t) => t === 'sin_datos')) return 'no_data';
  if (tiers.some((t) => t !== 'observado')) return 'partial';
  return 'ok';
}

export function computeDoblesGap(input: DoblesGapInput): DoblesGapResult {
  const { segments, self_solos, partner_solos, goal_total_s } = input;

  // Pass 1 — per segment: carrier, tier, each solo, and the raw pair prediction.
  const carriers = segments.map((_, i) => segmentCarrier(input, i));
  const tiers: PredictionTier[] = [];
  const rawPredicted: Array<number | null> = [];
  const selfSolo: Array<number | null> = [];
  const partnerSolo: Array<number | null> = [];
  for (let i = 0; i < segments.length; i++) {
    const self = self_solos[i] ?? { predicted_s: null, tier: 'sin_datos' as const };
    const partner = partner_solos[i] ?? { predicted_s: null, tier: 'sin_datos' as const };
    const { value, tier } = rawPairPrediction(carriers[i]!.carrier, carriers[i]!.self_share, self, partner);
    tiers.push(tier);
    rawPredicted.push(value);
    selfSolo.push(self.predicted_s);
    partnerSolo.push(partner.predicted_s);
  }

  // Pass 2 — the budget. With a goal, decompose it by the chosen fractions; with
  // no goal, the budget IS the pair prediction (scale only), sin_datos → 0.
  let budgets: number[];
  let source: DoblesBudgetSource | null;
  if (goal_total_s != null && goal_total_s > 0) {
    const chosen = chooseFractions(input, rawPredicted);
    budgets = largestRemainder(chosen.fractions, goal_total_s);
    source = chosen.source;
  } else {
    budgets = rawPredicted.map((v) => v ?? 0);
    source = null;
  }

  // Pass 3 — assemble; hold sin_datos segments at budget.
  const resultSegments: DoblesSegmentResult[] = segments.map((seg, i) => {
    const budget_s = budgets[i] ?? 0;
    const pair_predicted_s = rawPredicted[i] ?? budget_s;
    return {
      slug: seg.slug,
      label_es: seg.label_es,
      kind: seg.kind,
      station_index: seg.station_index,
      carrier: carriers[i]!.carrier,
      self_share: carriers[i]!.self_share,
      budget_s,
      pair_predicted_s,
      delta_s: pair_predicted_s - budget_s,
      self_solo_s: selfSolo[i] ?? null,
      partner_solo_s: partnerSolo[i] ?? null,
      tier: tiers[i]!,
    };
  });

  const availability = availabilityOf(tiers);
  // A no_data read predicts nothing real (every segment held at budget) — emit a
  // null total rather than a fabricated goal-equals-prediction.
  const predicted_total_s =
    availability === 'no_data'
      ? null
      : resultSegments.reduce((sum, s) => sum + s.pair_predicted_s, 0);

  const goal_s = goal_total_s != null && goal_total_s > 0 ? goal_total_s : null;

  return {
    availability,
    goal_s,
    predicted_total_s,
    gap_s: predicted_total_s != null && goal_s != null ? predicted_total_s - goal_s : null,
    budget_source: source,
    segments: resultSegments,
  };
}
