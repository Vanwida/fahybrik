import 'server-only';

// DOUBLES GOAL / prediction / gap — the data layer behind
// GET /api/athlete/dobles/race-gap.
//
// The doubles counterpart of lib/athlete/goal-gap.ts. It fetches everything the
// pure engine (shared/domain/dobles-gap) needs and hands it over; nothing the
// pure module can compute is computed here:
//
//   · SOLOS   — each of the two athletes' per-segment solo prediction, reusing
//               the SINGLES predict layer verbatim (fetchOwnRace + buildRaceTransfer
//               → predictSegment). One athlete's data never leaks into the other's.
//   · REPARTO — the pair's coach/athlete-authored station split (dobles_simulations),
//               resolved to the READING athlete's frame (a station absent → 50/50).
//   · BUDGET  — the pair's goal decomposed by a DOUBLES cohort near the goal, else
//               the reader's own doubles race, else the faster athlete's singles
//               race (see the engine for the full fallback order).
//   · TIPS    — the coach's editable "consejos de dobles" (race context), or the
//               system defaults.
//
// The wire is snake_case; the numbers are numbers (never strings). Honest gates:
// no_pair (no active doubles pair), no_data (neither athlete has any usable
// prediction), partial (some segment estimated / without data), ok.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  computeDoblesGap,
  type CohortRace,
  type DoblesGapInput,
  type PredictionTier,
  type RaceFractionSource,
  type SegmentDef,
  type SegmentKind,
  type SoloPrediction,
  type StationCarrier,
} from '@fahybrid/shared/domain/dobles-gap';
import {
  goalLabel,
  personalTransferFactor,
  predictSegment,
  COHORT_GOAL_TOLERANCE,
  MIN_COHORT_RACES,
  type OwnRace,
  type TrainedLevel,
} from '@fahybrid/shared/domain/goal-gap';
import { isoDateString, startOfDayInBox } from '@fahybrid/shared/domain/dates';
import {
  storedToReaderCarrier,
  type DoblesEditorKind,
} from '@fahybrid/shared/schema/dobles-simulation';
import {
  buildSegments,
  fetchOwnRace,
  toCohortRace,
  type RaceSplitRow,
} from './goal-gap';
import { buildRaceTransfer } from './race-transfer';
import { resolveCanonicalDoblesPair, type CanonicalDoblesPair } from './dobles-simulation-edit';
import { loadDoblesSimulationRow, resolveReaderStationSplits } from './dobles-simulation';
import { resolveCoachTips } from '@/lib/coach/guidance';

// ── Wire contract (iOS DoblesRaceGap; snake_case, numbers are numbers) ─────────

export interface DoblesRaceGapSegmentDTO {
  key: string;
  label_es: string;
  kind: SegmentKind;
  /**
   * Station identifier = the CANONICAL HYROX store index (2,4,…,16), the SAME id
   * used by dobles_simulations.station_splits[].station_index and by the athlete
   * PUT /api/athlete/dobles/simulation. NOT a 1..8 position — iOS echoes it back
   * verbatim when editing a station from the race board, so the reparto edit
   * round-trips onto the right station with zero remapping. Null for run/roxzone.
   */
  station_index: number | null;
  carrier: 'together' | 'self' | 'partner' | 'split';
  self_share: number | null;
  budget_s: number;
  pair_predicted_s: number;
  self_solo_s: number | null;
  partner_solo_s: number | null;
  tier: PredictionTier;
}

export interface DoblesRaceGapDTO {
  availability: 'ok' | 'partial' | 'no_pair' | 'no_data';
  race_name: string;
  race_date: string | null;
  partner_name: string | null;
  goal_s: number | null;
  goal_label: string | null;
  predicted_total_s: number | null;
  segments: DoblesRaceGapSegmentDTO[];
  coach_tips: string[];
  strategy_last_edited_by: string | null;
}

/** The doubles race the athlete is looking at (already ownership + format checked). */
export interface DoblesRaceContext {
  race_id: number;
  name: string;
  race_date: string | null;
  division: string;
  gender_category: string;
  goal_time_seconds: number | null;
}

export interface BuildDoblesRaceGapArgs {
  self_athlete_id: bigint;
  self_user_id: bigint;
  race: DoblesRaceContext;
}

// ── Per-athlete solo predictions (reuse of the SINGLES predict layer) ──────────

interface AthleteSolos {
  /** Per-segment solo prediction, aligned to buildSegments(). */
  solos: SoloPrediction[];
  /** The athlete's own last singles race (fraction fallback source). */
  own_singles: OwnRace | null;
  /** Σ predicted (non-null) — the "who's faster" comparison basis; null when none. */
  predicted_total: number | null;
}

/**
 * One athlete's solo prediction for the 10 segments, exactly as the singles
 * board computes it (goal-independent: predictSegment uses no budget except the
 * roxzone cohort-typical fallback, which we deliberately skip by passing 0 so a
 * solo roxzone is observado/estimado from the athlete's own race, else sin_datos).
 */
async function buildAthleteSolos(
  athlete_id: bigint,
  segments: SegmentDef[],
  todayIso: string,
  client: Sql,
): Promise<AthleteSolos> {
  const athleteId = Number(athlete_id);
  const [ownRace, transfer] = await Promise.all([
    fetchOwnRace(athleteId, todayIso, client),
    buildRaceTransfer({ athlete_id: athleteId }, client),
  ]);

  const trained: TrainedLevel[] = transfer.stations.map((st) => ({
    slug: st.slug,
    kind: st.kind,
    trained_value_s: st.trained.value_s,
    race_value_s: st.race_seconds,
  }));
  const trainedBySlug = new Map<string, TrainedLevel>();
  for (const t of trained) trainedBySlug.set(t.slug, t);
  const factor = personalTransferFactor(trained);

  const solos: SoloPrediction[] = segments.map((seg) => {
    const { predicted_s, tier } = predictSegment(seg, ownRace, trainedBySlug, factor, 0);
    return { predicted_s, tier };
  });

  let sum = 0;
  let any = false;
  for (const s of solos) {
    if (s.predicted_s != null) {
      sum += s.predicted_s;
      any = true;
    }
  }
  return { solos, own_singles: ownRace, predicted_total: any ? sum : null };
}

/** A complete singles OwnRace → the fraction source shape (all 8 stations present). */
function ownRaceToFractionSource(own: OwnRace | null): RaceFractionSource | null {
  if (!own || !own.complete || own.run_total_s == null || own.roxzone_s == null) return null;
  const station_s: Record<number, number> = {};
  for (const [k, v] of Object.entries(own.station_s)) {
    if (v != null && v > 0) station_s[Number(k)] = v;
  }
  return { run_total_s: own.run_total_s, station_s, roxzone_s: own.roxzone_s };
}

// ── Doubles budget fraction sources ────────────────────────────────────────────

/** The near-goal DOUBLES cohort, division+gender preferred, else doubles-only. */
async function fetchDoublesCohort(
  goal: number,
  division: string,
  gender: string,
  client: Sql,
): Promise<CohortRace[]> {
  const lo = Math.round(goal * (1 - COHORT_GOAL_TOLERANCE));
  const hi = Math.round(goal * (1 + COHORT_GOAL_TOLERANCE));
  const rows = await client<RaceSplitRow[]>`
    select
      division::text as division,
      gender_category::text as gender,
      run_total_seconds,
      run_splits_json,
      station_splits_json,
      roxzone_seconds,
      result_time_seconds
    from races
    where format = 'doubles'
      and source in ('hyrox_import', 'hyresult_import')
      and station_splits_json is not null
      and result_time_seconds is not null
      and result_time_seconds between ${lo} and ${hi}
    order by abs(result_time_seconds - ${goal}) asc
    limit 300
  `;
  const all: CohortRace[] = [];
  const matched: CohortRace[] = [];
  for (const r of rows) {
    const c = toCohortRace(r);
    if (!c) continue;
    all.push(c);
    if (r.division === division && r.gender === gender) matched.push(c);
  }
  if (matched.length >= MIN_COHORT_RACES) return matched;
  if (all.length >= MIN_COHORT_RACES) return all;
  return [];
}

interface DoublesRaceRow {
  run_total_seconds: number | null;
  run_splits_json: unknown;
  station_splits_json: unknown;
  roxzone_seconds: number | null;
  result_time_seconds: number | null;
}

/** The athlete's latest COMPLETE doubles race, as a budget fraction source. */
async function fetchOwnDoublesRace(athlete_id: bigint, client: Sql): Promise<RaceFractionSource | null> {
  const rows = await client<DoublesRaceRow[]>`
    select run_total_seconds, run_splits_json, station_splits_json,
           roxzone_seconds, result_time_seconds
    from races
    where athlete_id = ${Number(athlete_id)}
      and format = 'doubles'
      and source in ('hyrox_import', 'hyresult_import')
      and station_splits_json is not null
    order by race_date desc nulls last, id desc
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  const c = toCohortRace({ division: '', gender: '', ...row });
  return c ? { run_total_s: c.run_total_s, station_s: c.station_s, roxzone_s: c.roxzone_s } : null;
}

// ── Reparto (carriers) + strategy provenance ───────────────────────────────────

interface RepartoRead {
  carriers: Map<number, StationCarrier>;
  strategy_last_edited_by: string | null;
}

/**
 * The pair's station reparto in the READER's frame + who last touched the
 * strategy. No authored simulation → empty carriers (engine defaults every
 * station to 50/50) and a null editor.
 */
async function readReparto(pair: CanonicalDoblesPair, self_user_id: bigint, client: Sql): Promise<RepartoRead> {
  const partner_user_id = pair.reader_is_a ? pair.b_user_id : pair.a_user_id;
  const row = await loadDoblesSimulationRow(self_user_id, partner_user_id, client);
  if (!row) return { carriers: new Map(), strategy_last_edited_by: null };

  const readerSplits = resolveReaderStationSplits(row.station_splits, row.reader_is_a);
  const carriers = new Map<number, StationCarrier>();
  for (const [index, split] of readerSplits) {
    carriers.set(index, {
      carrier: storedToReaderCarrier(split.assigned_to, row.reader_is_a),
      self_share: split.self_share,
    });
  }

  const strategy_last_edited_by = resolveEditorName(
    row.last_edited_by_kind,
    row.last_edited_by_user_id,
    pair,
    self_user_id,
  );
  return { carriers, strategy_last_edited_by };
}

/** Provenance display name from the reader's frame (coach / self / partner). */
function resolveEditorName(
  kind: DoblesEditorKind | null,
  editorUserId: string | null,
  pair: CanonicalDoblesPair,
  self_user_id: bigint,
): string | null {
  if (kind === 'coach') return pair.coach_name ?? null;
  if (kind === 'athlete' && editorUserId != null) {
    const id = BigInt(editorUserId);
    const selfName = pair.reader_is_a ? pair.a_name : pair.b_name;
    const partnerName = pair.reader_is_a ? pair.b_name : pair.a_name;
    if (id === self_user_id) return selfName;
    return partnerName;
  }
  return null;
}

// ── Builder ─────────────────────────────────────────────────────────────────────

export async function buildDoblesRaceGap(
  args: BuildDoblesRaceGapArgs,
  client: Sql = defaultSql,
): Promise<DoblesRaceGapDTO> {
  const { self_athlete_id, self_user_id, race } = args;
  const todayIso = isoDateString(startOfDayInBox(new Date()));
  const segments = buildSegments();
  const goal = race.goal_time_seconds != null && race.goal_time_seconds > 0 ? race.goal_time_seconds : null;

  const pair = await resolveCanonicalDoblesPair(self_athlete_id, self_user_id, client);

  // No active pair → the whole doubles board is off; still honest about the race
  // + the coach's (athlete's) default tips.
  if (!pair) {
    const coach_tips = await resolveCoachTips(await athleteCoachId(self_athlete_id, client), 'race_doubles', client);
    return {
      availability: 'no_pair',
      race_name: race.name,
      race_date: race.race_date,
      partner_name: null,
      goal_s: goal,
      goal_label: goal != null ? goalLabel(goal) : null,
      predicted_total_s: null,
      segments: [],
      coach_tips,
      strategy_last_edited_by: null,
    };
  }

  const partner_athlete_id = pair.reader_is_a ? pair.b_athlete_id : pair.a_athlete_id;
  const partner_name = pair.reader_is_a ? pair.b_name : pair.a_name;

  const [self, partner, reparto, coach_tips] = await Promise.all([
    buildAthleteSolos(self_athlete_id, segments, todayIso, client),
    buildAthleteSolos(partner_athlete_id, segments, todayIso, client),
    readReparto(pair, self_user_id, client),
    resolveCoachTips(pair.coach_id, 'race_doubles', client),
  ]);

  // Fraction sources for the budget (only when there's a goal to decompose).
  let cohort_doubles: CohortRace[] = [];
  let own_doubles: RaceFractionSource | null = null;
  if (goal != null) {
    [cohort_doubles, own_doubles] = await Promise.all([
      fetchDoublesCohort(goal, race.division, race.gender_category, client),
      fetchOwnDoublesRace(self_athlete_id, client),
    ]);
  }
  // The faster athlete (lower predicted total) supplies the singles reference.
  const faster_singles = pickFasterSingles(self, partner);

  const input: DoblesGapInput = {
    goal_total_s: goal,
    segments,
    self_solos: self.solos,
    partner_solos: partner.solos,
    carriers: reparto.carriers,
    cohort_doubles,
    own_doubles,
    faster_singles,
  };
  const result = computeDoblesGap(input);

  return {
    availability: result.availability,
    race_name: race.name,
    race_date: race.race_date,
    partner_name,
    goal_s: result.goal_s,
    goal_label: result.goal_s != null ? goalLabel(result.goal_s) : null,
    predicted_total_s: result.predicted_total_s,
    segments: result.segments.map((s) => ({
      key: s.slug,
      label_es: s.label_es,
      kind: s.kind,
      station_index: s.station_index,
      carrier: s.carrier,
      self_share: s.self_share,
      budget_s: s.budget_s,
      pair_predicted_s: s.pair_predicted_s,
      self_solo_s: s.self_solo_s,
      partner_solo_s: s.partner_solo_s,
      tier: s.tier,
    })),
    coach_tips,
    strategy_last_edited_by: reparto.strategy_last_edited_by,
  };
}

/** The faster athlete's singles race as the budget shape reference. */
function pickFasterSingles(self: AthleteSolos, partner: AthleteSolos): RaceFractionSource | null {
  const st = self.predicted_total;
  const pt = partner.predicted_total;
  // Prefer whichever has a lower (non-null) predicted total; fall to the one that
  // has data when only one does.
  let faster: AthleteSolos | null = null;
  if (st != null && pt != null) faster = st <= pt ? self : partner;
  else if (st != null) faster = self;
  else if (pt != null) faster = partner;
  if (!faster) return null;
  const primary = ownRaceToFractionSource(faster.own_singles);
  if (primary) return primary;
  // Faster athlete has no complete singles race → try the other's.
  const other = faster === self ? partner : self;
  return ownRaceToFractionSource(other.own_singles);
}

/** The athlete's coach id (for default tips when there is no active pair). */
async function athleteCoachId(athlete_id: bigint, client: Sql): Promise<bigint | null> {
  const rows = await client<{ coach_id: string | null }[]>`
    select coach_id::text as coach_id from athletes where id = ${Number(athlete_id)} limit 1
  `;
  const v = rows[0]?.coach_id;
  return v != null ? BigInt(v) : null;
}
