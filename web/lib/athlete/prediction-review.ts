import 'server-only';

// PREDICTED vs REAL — the data layer behind GET /api/athlete/prediction-review.
//
// Takes an event (an imported race by race_id, or a hyrox_sim execution by
// execution_id), reads its REAL per-segment splits, finds the LAST goal-gap
// snapshot frozen BEFORE that event, and hands both to the pure
// computePredictionReview (shared/domain/goal-gap). Honest gates: no snapshot
// before the event → 'no_snapshot'; the event has no usable splits → 'no_actual';
// the id isn't the athlete's → 'not_found'. Nothing the pure module can compute
// is computed here; the insight is the deterministic template it owns.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { computePredictionReview, type SnapshotSegment } from '@fahybrid/shared/domain/goal-gap';
import { isoDateString, startOfDayInBox } from '@fahybrid/shared/domain/dates';
import { STATION_CATALOGUE } from './station-detail';
import { segmentLabels } from './goal-gap';

// ── Wire contract (matches iOS PredictionReview) ──────────────────────────────

export interface PredictionReviewSegmentDTO {
  slug: string;
  label_es: string;
  predicted_s: number;
  actual_s: number;
  delta_s: number;
}

export interface PredictionReviewDTO {
  availability: 'ok' | 'no_snapshot' | 'no_actual' | 'not_found';
  predicted_total_s: number | null;
  actual_total_s: number | null;
  accuracy_pct: number | null;
  segments: PredictionReviewSegmentDTO[];
  insight_es: string | null;
}

const EMPTY: Omit<PredictionReviewDTO, 'availability'> = {
  predicted_total_s: null,
  actual_total_s: null,
  accuracy_pct: null,
  segments: [],
  insight_es: null,
};

// ── The real event splits ─────────────────────────────────────────────────────

interface ActualSplits {
  /** ISO day of the event (the snapshot must predate it). */
  event_date_iso: string;
  /** Real seconds per segment slug (run + stations + roxzone where recorded). */
  by_slug: Record<string, number | null>;
  /** The real finish total. */
  total_s: number;
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

/** Actuals from an imported race: run total, station splits, roxzone, result. */
async function raceActuals(athleteId: number, raceId: number, client: Sql): Promise<ActualSplits | null> {
  const rows = await client<
    Array<{
      race_date: string | null;
      run_total_seconds: number | null;
      run_splits_json: unknown;
      station_splits_json: unknown;
      roxzone_seconds: number | null;
      result_time_seconds: number | null;
    }>
  >`
    select
      to_char(race_date, 'YYYY-MM-DD') as race_date,
      run_total_seconds, run_splits_json, station_splits_json, roxzone_seconds, result_time_seconds
    from races
    where id = ${raceId} and athlete_id = ${athleteId}
    limit 1
  `;
  const row = rows[0];
  if (!row || row.race_date == null) return null;

  const by_slug: Record<string, number | null> = {};

  // Run total (column, else summed laps).
  let run = row.run_total_seconds;
  if ((run == null || run <= 0) && Array.isArray(row.run_splits_json)) {
    const laps = row.run_splits_json.map((n) => toNum(n)).filter((n): n is number => n != null && n > 0);
    run = laps.length ? laps.reduce((a, b) => a + b, 0) : null;
  }
  by_slug.run = run;

  // Stations by canonical index.
  const map = new Map<number, number | null>();
  if (Array.isArray(row.station_splits_json)) {
    for (const s of row.station_splits_json) {
      if (!s || typeof s !== 'object') continue;
      const idx = toNum((s as { index?: unknown }).index);
      if (idx != null) map.set(idx, toNum((s as { seconds?: unknown }).seconds));
    }
  }
  for (const e of STATION_CATALOGUE) by_slug[e.slug] = map.get(e.index) ?? null;

  by_slug.roxzone = row.roxzone_seconds;

  const total = row.result_time_seconds;
  if (total == null || total <= 0) return null;
  return { event_date_iso: row.race_date, by_slug, total_s: total };
}

/** Actuals from a hyrox_sim execution: run = summed run segments, ski/row by
 *  modality, the 6 functional stations by exercise station position, roxzone left
 *  unrecorded (not derivable from a session). */
async function executionActuals(athleteId: number, executionId: number, client: Sql): Promise<ActualSplits | null> {
  const execRows = await client<Array<{ started_at: string; total_duration_seconds: number | null }>>`
    select started_at::text as started_at, total_duration_seconds
    from workout_executions
    where id = ${executionId} and athlete_id = ${athleteId}
    limit 1
  `;
  const exec = execRows[0];
  if (!exec) return null;
  const eventDateIso = isoDateString(startOfDayInBox(new Date(exec.started_at)));

  const segRows = await client<
    Array<{ modality: string | null; station_position: number | null; duration_s: string | null }>
  >`
    select
      se.modality,
      ex.hyrox_station_position as station_position,
      extract(epoch from (se.ended_at - se.started_at))::text as duration_s
    from segment_executions se
    left join exercises ex on ex.id = se.exercise_id
    where se.execution_id = ${executionId}
      and se.started_at is not null and se.ended_at is not null and se.ended_at > se.started_at
  `;

  // position (1-8) → catalogue slug (ski=1, row=5, the 6 functionals otherwise).
  const slugByPosition = new Map<number, string>(STATION_CATALOGUE.map((e) => [e.position, e.slug]));
  const acc: Record<string, number> = {};
  const add = (slug: string, secs: number) => {
    acc[slug] = (acc[slug] ?? 0) + secs;
  };
  for (const r of segRows) {
    const secs = toNum(r.duration_s);
    if (secs == null || secs <= 0) continue;
    if (r.modality === 'run') add('run', secs);
    else if (r.modality === 'ski') add('ski-erg', secs);
    else if (r.modality === 'row') add('row', secs);
    else if (r.station_position != null) {
      const slug = slugByPosition.get(r.station_position);
      if (slug) add(slug, secs);
    }
  }
  if (Object.keys(acc).length === 0) return null;

  const by_slug: Record<string, number | null> = { ...acc };
  const total = exec.total_duration_seconds ?? Object.values(acc).reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  return { event_date_iso: eventDateIso, by_slug, total_s: total };
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

interface SnapshotRow {
  predicted_total_s: number;
  segments_json: unknown;
}

/** The last snapshot frozen strictly before the event day. For a race the
 *  snapshot must have been aimed at THAT race; a session takes the latest. */
async function fetchSnapshot(
  athleteId: number,
  eventDateIso: string,
  targetRaceId: number | null,
  client: Sql,
): Promise<SnapshotRow | null> {
  const rows = targetRaceId
    ? await client<SnapshotRow[]>`
        select predicted_total_s, segments_json
        from race_predictions
        where athlete_id = ${athleteId}
          and target_race_id = ${targetRaceId}
          and pred_date < ${eventDateIso}::date
        order by pred_date desc, created_at desc
        limit 1
      `
    : await client<SnapshotRow[]>`
        select predicted_total_s, segments_json
        from race_predictions
        where athlete_id = ${athleteId}
          and pred_date < ${eventDateIso}::date
        order by pred_date desc, created_at desc
        limit 1
      `;
  return rows[0] ?? null;
}

/** segments_json → the review's SnapshotSegment[] (labels rejoined from the skeleton). */
function toSnapshotSegments(raw: unknown): SnapshotSegment[] {
  if (!Array.isArray(raw)) return [];
  const labels = segmentLabels();
  const out: SnapshotSegment[] = [];
  for (const s of raw) {
    if (!s || typeof s !== 'object') continue;
    const slug = (s as { slug?: unknown }).slug;
    if (typeof slug !== 'string') continue;
    out.push({ slug, label_es: labels.get(slug) ?? slug, predicted_s: toNum((s as { predicted_s?: unknown }).predicted_s) });
  }
  return out;
}

// ── Builder ───────────────────────────────────────────────────────────────────

export async function buildPredictionReview(
  args: { athlete_id: number | bigint; race_id?: number; execution_id?: number },
  client: Sql = defaultSql,
): Promise<PredictionReviewDTO> {
  const athleteId = Number(args.athlete_id);

  const actuals = args.race_id
    ? await raceActuals(athleteId, args.race_id, client)
    : args.execution_id
      ? await executionActuals(athleteId, args.execution_id, client)
      : null;
  if (!actuals) return { availability: args.race_id || args.execution_id ? 'no_actual' : 'not_found', ...EMPTY };

  const snapshot = await fetchSnapshot(athleteId, actuals.event_date_iso, args.race_id ?? null, client);
  if (!snapshot) return { availability: 'no_snapshot', ...EMPTY };

  const review = computePredictionReview({
    predicted_total_s: snapshot.predicted_total_s,
    actual_total_s: actuals.total_s,
    snapshot_segments: toSnapshotSegments(snapshot.segments_json),
    actual_by_slug: actuals.by_slug,
  });

  return {
    availability: 'ok',
    predicted_total_s: review.predicted_total_s,
    actual_total_s: review.actual_total_s,
    accuracy_pct: review.accuracy_pct,
    segments: review.segments,
    insight_es: review.insight_es,
  };
}
