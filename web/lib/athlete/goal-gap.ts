import 'server-only';

// GOAL / prediction / gap — the data layer behind GET /api/athlete/goal-gap.
//
// Fetches everything the pure engine (shared/domain/goal-gap) needs and hands it
// over; nothing that the pure module can compute is computed here.
//
//   · GOAL      — the athlete's soonest upcoming target race (getTargetRaceRow) +
//                 its goal_time_seconds. No target → gate; target without a goal →
//                 gate.
//   · BUDGET    — the goal decomposed by the mean fractions of a real singles
//                 COHORT near the goal (division+gender, else relaxed to
//                 singles-only), or the athlete's own last complete singles race.
//   · PREDICT   — reuses the training × race CROSS (buildRaceTransfer) for the
//                 trained levels + competed values, and the athlete's own last
//                 singles race for the observed splits.
//
// On a real 'ok' read the day's snapshot is persisted to race_predictions
// (best-effort) so the future predicted-vs-real read is honest (frozen before the
// event). The wire is snake_case, mirroring the iOS GoalGap contract.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  computeGoalGap,
  goalLabel,
  GOAL_GAP_MODEL_VERSION,
  COHORT_GOAL_TOLERANCE,
  MIN_COHORT_RACES,
  type BudgetSource,
  type CohortRace,
  type OwnRace,
  type PredictionTier,
  type SegmentDef,
  type SegmentKind,
  type TrainedLevel,
} from '@fahybrid/shared/domain/goal-gap';
import { getTargetRaceRow } from '@fahybrid/shared/domain/coach/target-race';
import { isoDateString, startOfDayInBox } from '@fahybrid/shared/domain/dates';
import { buildRaceTransfer } from './race-transfer';
import { STATION_CATALOGUE } from './station-detail';

// ── Wire contract (matches iOS GoalGap) ───────────────────────────────────────

export interface GoalGapSegmentDTO {
  slug: string;
  label_es: string;
  kind: SegmentKind;
  budget_s: number;
  predicted_s: number | null;
  tier: PredictionTier;
  delta_s: number | null;
}

export interface GoalGapDTO {
  availability: 'ok' | 'no_goal' | 'no_target_race' | 'no_data';
  goal: { label: string; total_s: number; race_name: string; race_date: string | null } | null;
  predicted_total_s: number | null;
  gap_s: number | null;
  budget_source: BudgetSource | null;
  segments: GoalGapSegmentDTO[];
  updated_at: string;
}

// ── Segment skeleton (run, the 8 stations, roxzone) ───────────────────────────

const RUN_SEGMENT: SegmentDef = { slug: 'run', label_es: 'Carrera a pie', kind: 'run', station_index: null };
const ROXZONE_SEGMENT: SegmentDef = { slug: 'roxzone', label_es: 'Roxzone', kind: 'roxzone', station_index: null };

/** The 10 segments in render order. */
export function buildSegments(): SegmentDef[] {
  const stations: SegmentDef[] = STATION_CATALOGUE.map((e) => ({
    slug: e.slug,
    label_es: e.label,
    kind: 'station',
    station_index: e.index,
  }));
  return [RUN_SEGMENT, ...stations, ROXZONE_SEGMENT];
}

/** slug → ES label for the 10 segments (predicted-vs-real reuses this so the
 *  frozen snapshot never has to store labels). */
export function segmentLabels(): Map<string, string> {
  return new Map(buildSegments().map((s) => [s.slug, s.label_es]));
}

// ── DB row parsing ────────────────────────────────────────────────────────────

interface RaceSplitRow {
  division: string;
  gender: string;
  run_total_seconds: number | null;
  run_splits_json: unknown;
  station_splits_json: unknown;
  roxzone_seconds: number | null;
  result_time_seconds: number | null;
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

/** Run total: the stored column, else the sum of the 8 run laps. Null when neither. */
function runTotal(runTotalCol: number | null, runSplitsJson: unknown): number | null {
  if (runTotalCol != null && runTotalCol > 0) return runTotalCol;
  if (!Array.isArray(runSplitsJson)) return null;
  const laps = runSplitsJson.map((n) => toNum(n)).filter((n): n is number => n != null && n > 0);
  if (laps.length === 0) return null;
  return laps.reduce((a, b) => a + b, 0);
}

/** station_splits_json → { station_index: seconds|null }. */
function parseStationMap(raw: unknown): Record<number, number | null> {
  const out: Record<number, number | null> = {};
  if (!Array.isArray(raw)) return out;
  for (const s of raw) {
    if (!s || typeof s !== 'object') continue;
    const idx = toNum((s as { index?: unknown }).index);
    if (idx == null) continue;
    out[idx] = toNum((s as { seconds?: unknown }).seconds);
  }
  return out;
}

/** A race row is a COMPLETE cohort sample when all 10 segments are present + > 0. */
function toCohortRace(row: RaceSplitRow): CohortRace | null {
  const run = runTotal(row.run_total_seconds, row.run_splits_json);
  const rox = row.roxzone_seconds;
  const result = row.result_time_seconds;
  if (run == null || run <= 0 || rox == null || rox <= 0 || result == null || result <= 0) return null;
  const map = parseStationMap(row.station_splits_json);
  const stations: Record<number, number> = {};
  for (const e of STATION_CATALOGUE) {
    const v = map[e.index];
    if (v == null || v <= 0) return null; // missing a station → not complete
    stations[e.index] = v;
  }
  return { run_total_s: run, station_s: stations, roxzone_s: rox, result_s: result };
}

// ── Fetches ───────────────────────────────────────────────────────────────────

/** The near-goal singles cohort, division+gender preferred, else singles-only. */
async function fetchCohort(goal: number, division: string, gender: string, client: Sql): Promise<CohortRace[]> {
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
    where format = 'singles'
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
  // Division+gender when trustworthy; else relax to singles-only; else none.
  if (matched.length >= MIN_COHORT_RACES) return matched;
  if (all.length >= MIN_COHORT_RACES) return all;
  return [];
}

interface OwnRaceRow {
  id: number;
  race_date: string | null;
  age_days: number | null;
  run_total_seconds: number | null;
  run_splits_json: unknown;
  station_splits_json: unknown;
  roxzone_seconds: number | null;
  result_time_seconds: number | null;
}

/** The athlete's latest singles race (the same one the CROSS reads). */
async function fetchOwnRace(athleteId: number, todayIso: string, client: Sql): Promise<OwnRace | null> {
  const rows = await client<OwnRaceRow[]>`
    select
      id::int as id,
      to_char(race_date, 'YYYY-MM-DD') as race_date,
      (${todayIso}::date - race_date)::int as age_days,
      run_total_seconds,
      run_splits_json,
      station_splits_json,
      roxzone_seconds,
      result_time_seconds
    from races
    where athlete_id = ${athleteId}
      and format = 'singles'
      and source in ('hyrox_import', 'hyresult_import')
      and station_splits_json is not null
    order by race_date desc nulls last, id desc
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;

  const run = runTotal(row.run_total_seconds, row.run_splits_json);
  const stationMap = parseStationMap(row.station_splits_json);
  const complete =
    toCohortRace({
      division: '',
      gender: '',
      run_total_seconds: row.run_total_seconds,
      run_splits_json: row.run_splits_json,
      station_splits_json: row.station_splits_json,
      roxzone_seconds: row.roxzone_seconds,
      result_time_seconds: row.result_time_seconds,
    }) != null;

  return {
    race_id: row.id,
    date_iso: row.race_date,
    age_days: row.age_days,
    run_total_s: run,
    station_s: stationMap,
    roxzone_s: row.roxzone_seconds,
    result_s: row.result_time_seconds,
    complete,
  };
}

// ── Snapshot (best-effort) ────────────────────────────────────────────────────

/** Persist the day's prediction so predicted-vs-real stays honest (frozen before
 *  the event). One row per athlete per box-tz day (upsert). Never blocks the read. */
async function persistSnapshot(
  athleteId: number,
  targetRaceId: number,
  goal: number,
  predictedTotal: number,
  segments: GoalGapSegmentDTO[],
  todayIso: string,
  client: Sql,
): Promise<void> {
  const snapshotSegments = segments.map((s) => ({
    slug: s.slug,
    kind: s.kind,
    budget_s: s.budget_s,
    predicted_s: s.predicted_s,
    tier: s.tier,
  }));
  try {
    await client`
      insert into race_predictions
        (athlete_id, target_race_id, goal_time_seconds, predicted_total_s, segments_json, model_version, pred_date)
      values
        (${athleteId}, ${targetRaceId}, ${goal}, ${predictedTotal}, ${client.json(snapshotSegments)},
         ${GOAL_GAP_MODEL_VERSION}, ${todayIso}::date)
      on conflict (athlete_id, pred_date) do update set
        target_race_id = excluded.target_race_id,
        goal_time_seconds = excluded.goal_time_seconds,
        predicted_total_s = excluded.predicted_total_s,
        segments_json = excluded.segments_json,
        model_version = excluded.model_version,
        created_at = now()
    `;
  } catch {
    // Best-effort: the snapshot is not on the critical path; a failure to write it
    // must never break the athlete's goal-gap read.
  }
}

// ── Builder ───────────────────────────────────────────────────────────────────

export async function buildGoalGap(
  args: { athlete_id: number | bigint },
  client: Sql = defaultSql,
): Promise<GoalGapDTO> {
  const athleteId = Number(args.athlete_id);
  const todayIso = isoDateString(startOfDayInBox(new Date()));
  const updated_at = new Date().toISOString();

  const target = await getTargetRaceRow(athleteId, client);
  if (!target) {
    return { availability: 'no_target_race', goal: null, predicted_total_s: null, gap_s: null, budget_source: null, segments: [], updated_at };
  }
  if (target.goal_time_seconds == null || target.goal_time_seconds <= 0) {
    return { availability: 'no_goal', goal: null, predicted_total_s: null, gap_s: null, budget_source: null, segments: [], updated_at };
  }

  const goal = target.goal_time_seconds;
  const segments = buildSegments();

  const [cohort, ownRace, transfer] = await Promise.all([
    fetchCohort(goal, target.division, target.gender_category, client),
    fetchOwnRace(athleteId, todayIso, client),
    buildRaceTransfer({ athlete_id: athleteId }, client),
  ]);

  const trained: TrainedLevel[] = transfer.stations.map((st) => ({
    slug: st.slug,
    kind: st.kind,
    trained_value_s: st.trained.value_s,
    race_value_s: st.race_seconds,
  }));

  const result = computeGoalGap({ goal_total_s: goal, segments, cohort, own_race: ownRace, trained });

  const goalDto = { label: goalLabel(goal), total_s: goal, race_name: target.name, race_date: target.race_date };

  if (result.budget_source == null) {
    // A goal exists but there's nothing to build a budget from yet.
    return { availability: 'no_data', goal: goalDto, predicted_total_s: null, gap_s: null, budget_source: null, segments: [], updated_at };
  }

  const segmentDtos: GoalGapSegmentDTO[] = result.segments.map((s) => ({
    slug: s.slug,
    label_es: s.label_es,
    kind: s.kind,
    budget_s: s.budget_s,
    predicted_s: s.predicted_s,
    tier: s.tier,
    delta_s: s.delta_s,
  }));

  if (result.predicted_total_s != null) {
    await persistSnapshot(athleteId, target.race_id, goal, result.predicted_total_s, segmentDtos, todayIso, client);
  }

  return {
    availability: 'ok',
    goal: goalDto,
    predicted_total_s: result.predicted_total_s,
    gap_s: result.gap_s,
    budget_source: result.budget_source,
    segments: segmentDtos,
    updated_at,
  };
}
