// Running deep-dive analysis — the data layer behind GET /api/athlete/running-analysis.
//
// Computes the athlete's running deep-dive bundle from EXISTING training data
// (segment_executions where modality resolves to 'run') plus a Jack-Daniels VDOT
// derived from their stored `run_5k` benchmark. Output shape mirrors the iOS
// `RunningAnalysis` Codable contract (snake_case; pre-formatted display strings).
//
// HONEST NULLS: anything we cannot measure yet is null / empty, never faked.
//   • threshold_pace / vo2_estimate / pace_zones → only when a run_5k benchmark
//     exists (VDOT input). No benchmark → null / [].
//   • best_1k / weekly_volume_km / splits / progression → from real executions;
//     empty when the athlete has no run segments.
//   • training → [] (the session→station linkage isn't a clean single source
//     here; left empty rather than fabricated — the view hides the section).
//
// Modality resolution mirrors modality-analytics.ts exactly (explicit
// se.modality column wins; else derive from the exercise), single-sourced as the
// SEG_MODALITY_SQL fragment so the run filter never drifts from the breakdown.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { computeVdot, RUN_5K_METERS } from '@fahybrid/shared/domain/running/vdot';

// ── Wire contract (matches iOS RunningAnalysis) ─────────────────────────────

export interface RunningSplitDTO {
  id: string;
  label: string;
  pace: string | null;
  height: number;
  severity: 'better' | 'slightly_worse' | 'worse';
  /** Average running cadence over this split (steps/min, mig 0124), or null when
   *  the segment carries no cadence (older logs, manual entry, no wearable). */
  cadence_spm: number | null;
  /** Average treadmill/uphill grade % over this split, or null when uncaptured. */
  incline_pct: number | null;
}

export interface RunningPaceZoneDTO {
  id: string;
  zone: number;
  descriptor: string;
  pace: string | null;
  highlight: boolean;
}

export interface RunningProgressionPointDTO {
  id: string;
  height: number;
  pace: string | null;
  current: boolean;
}

export interface TrainingLinkDTO {
  id: string;
  title: string;
  group: string | null;
  count: string | null;
  next_label: string | null;
  modality: string | null;
}

/** One past 5 km time trial — the run_5k benchmark history, oldest→newest, so the
 *  athlete sees their 5 km progression (e.g. 21:00 → 20:25 → 19:58). */
export interface FiveKTrendPointDTO {
  date: string; // YYYY-MM-DD the test was recorded
  seconds: number; // total 5 km time in seconds (drives the sparkline + delta)
  time: string; // pre-formatted "m:ss" (e.g. "19:58")
}

export interface RunningAnalysisDTO {
  threshold_pace: string | null;
  vo2_estimate: string | null;
  best_1k: string | null;
  /** Current ISO-week (Monday-start) running volume — the deep-dive's "esta
   *  semana" figure (also available live via StatsService). */
  weekly_volume_km: string | null;
  /** Rolling last-7-days running volume — the Inicio "Volumen · 7 días" figure.
   *  Distinct from `weekly_volume_km` (ISO week) so each label stays honest. */
  volume_7d_km: string | null;
  /** run_5k benchmark history (oldest→newest); [] when the athlete has none. */
  five_k_trend: FiveKTrendPointDTO[];
  splits: RunningSplitDTO[];
  split_drop_note: string | null;
  pace_zones: RunningPaceZoneDTO[];
  progression: RunningProgressionPointDTO[];
  training: TrainingLinkDTO[];
}

// ── Constants ───────────────────────────────────────────────────────────────

// Lookback window for volume/progression aggregation (matches analytics).
const ANALYTICS_WINDOW_DAYS = 90;
// A segment only counts as a "1 km" effort for best_1k when its distance is in
// this band — excludes warm-up strides and long single-segment runs that would
// distort a per-km PR after scaling.
const ONE_KM_MIN_METERS = 800;
const ONE_KM_MAX_METERS = 1200;
// Final-drift callout threshold: surface a note when the second half of the most
// recent run is at least this many s/km slower than the first half.
const SPLIT_DRIFT_NOTE_S_PER_KM = 8;
// How many weekly buckets of threshold-pace progression to surface (most recent).
const PROGRESSION_WEEKS = 6;
// Pace-bar severity bands, expressed as a fraction slower than the run's best km.
// ≤4% over best → "better"; ≤10% → "slightly_worse"; beyond → "worse".
const SEVERITY_BETTER_MAX = 0.04;
const SEVERITY_SLIGHTLY_WORSE_MAX = 0.1;

type Severity = 'better' | 'slightly_worse' | 'worse';

// Mirror of modality-analytics.ts SEG_MODALITY_SQL — kept identical so the run
// filter here and the breakdown there never disagree.
const SEG_MODALITY_SQL = (sql: Sql) => sql`
  coalesce(
    se.modality,
    case
      when ex.category = 'cardio' and ex.slug ilike '%run%'  then 'run'
      when ex.category = 'cardio' and ex.slug ilike '%row%'  then 'row'
      when ex.category = 'cardio' and (ex.slug ilike '%ski%') then 'ski'
      when ex.category = 'cardio' and (ex.slug ilike '%bike%' or ex.slug ilike '%cycl%') then 'bike'
      when ex.category = 'strength' then 'strength'
      when ex.category is not null then 'other'
      else 'other'
    end
  )
`;

// ── Formatting helpers ───────────────────────────────────────────────────────

function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

/** Seconds → "m:ss" pace string (e.g. 285 → "4:45"). Null-safe. */
function paceStr(secPerKm: number | null | undefined): string | null {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm <= 0) return null;
  const total = Math.round(secPerKm);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** A pace range "m:ss–m:ss" for zone rows. */
function paceRangeStr(loSec: number, hiSec: number): string | null {
  const lo = paceStr(Math.min(loSec, hiSec));
  const hi = paceStr(Math.max(loSec, hiSec));
  if (!lo || !hi) return null;
  return lo === hi ? lo : `${lo}–${hi}`;
}

/** Metres → "x.y km" volume string. */
function kmStr(meters: number): string | null {
  if (!Number.isFinite(meters) || meters <= 0) return null;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Classify a per-km pace against the best km of the same run. */
function severityVsBest(paceSec: number, bestSec: number): Severity {
  if (bestSec <= 0) return 'worse';
  const over = (paceSec - bestSec) / bestSec;
  if (over <= SEVERITY_BETTER_MAX) return 'better';
  if (over <= SEVERITY_SLIGHTLY_WORSE_MAX) return 'slightly_worse';
  return 'worse';
}

// ── Builder ───────────────────────────────────────────────────────────────--

export async function buildRunningAnalysis(
  args: { athlete_id: number | bigint },
  client: Sql = defaultSql,
): Promise<RunningAnalysisDTO> {
  const athleteId = Number(args.athlete_id);
  const mod = SEG_MODALITY_SQL(client);

  // ── VDOT-derived tiles (threshold / VO₂ / pace zones) ──────────────────────
  // Source = the athlete's stored run_5k benchmark (seconds), the same canonical
  // (exercise_slug, unit) the onboarding submit writes.
  const benchRows = await client<Array<{ value: string }>>`
    select value::text as value
    from athlete_benchmarks
    where athlete_id = ${athleteId}
      and exercise_slug = 'run_5k'
      and unit = 'seconds'
    order by recorded_at desc
    limit 1
  `;
  const fiveKSeconds = benchRows[0] ? num(benchRows[0].value) : null;
  const vdot =
    fiveKSeconds != null && fiveKSeconds > 0
      ? computeVdot({ distance_meters: RUN_5K_METERS, duration_seconds: fiveKSeconds })
      : null;

  // ── 5 km trend (run_5k benchmark history, oldest→newest) ───────────────────
  // The full versioned history of the same canonical (slug, unit) the latest-row
  // VDOT query reads — so the athlete sees their 5 km progression, not just the
  // current number. Empty when they have no run_5k benchmark.
  const fiveKRows = await client<Array<{ value: string; recorded_on: string }>>`
    select value::text as value,
           to_char(recorded_at, 'YYYY-MM-DD') as recorded_on
    from athlete_benchmarks
    where athlete_id = ${athleteId}
      and exercise_slug = 'run_5k'
      and unit = 'seconds'
    order by recorded_at asc
  `;
  const five_k_trend: FiveKTrendPointDTO[] = fiveKRows
    .map((r) => ({ date: r.recorded_on, seconds: Math.round(num(r.value)) }))
    .filter((r) => r.seconds > 0)
    .map((r) => ({ date: r.date, seconds: r.seconds, time: paceStr(r.seconds) ?? '' }));

  // ── Ritmo umbral (Z4) — the trained threshold the PLAN prescribes from ───────
  // Source = the athlete's CURRENT run zone profile threshold_s (the exact store
  // the plan resolver reads), NOT a re-derivation from VDOT. This kills the
  // two-truths bug where Inicio showed a 5k→VDOT umbral that differed from what
  // the plan actually trains. VDOT + the 5 km trend stay below as a DISTINCT
  // test-progress concept, so the two numbers can never contradict. Honest null
  // when the athlete has no run zone profile yet.
  const runProfileRows = await client<Array<{ threshold_s: string }>>`
    select threshold_s::text as threshold_s
    from athlete_zone_profiles
    where athlete_id = ${athleteId} and modality = 'run'
    order by version desc
    limit 1
  `;
  const trainedThresholdS = runProfileRows[0] ? num(runProfileRows[0].threshold_s) : null;
  const threshold_pace: string | null =
    trainedThresholdS != null && trainedThresholdS > 0 ? paceStr(trainedThresholdS) : null;

  let vo2_estimate: string | null = null;
  let pace_zones: RunningPaceZoneDTO[] = [];

  if (vdot) {
    const p = vdot.paces;
    vo2_estimate = `${vdot.vdot.toFixed(1)}`;
    // Map Daniels paces onto the deep-dive's Z2–Z5 rows. Threshold (Z4) is the
    // accented row. Each row shows a small band around the canonical pace so the
    // athlete reads a target range, not a single brittle number.
    pace_zones = [
      {
        id: 'z2',
        zone: 2,
        descriptor: 'rodaje',
        pace: paceRangeStr(p.easy_s_per_km - 10, p.easy_s_per_km + 20),
        highlight: false,
      },
      {
        id: 'z3',
        zone: 3,
        descriptor: 'maratón',
        pace: paceRangeStr(p.marathon_s_per_km - 8, p.marathon_s_per_km + 8),
        highlight: false,
      },
      {
        id: 'z4',
        zone: 4,
        descriptor: 'umbral',
        pace: paceRangeStr(p.threshold_s_per_km - 5, p.threshold_s_per_km + 5),
        highlight: true,
      },
      {
        id: 'z5',
        zone: 5,
        descriptor: 'VO₂máx',
        pace: paceRangeStr(p.interval_s_per_km - 6, p.interval_s_per_km + 6),
        highlight: false,
      },
    ];
  }

  // ── best_1k + weekly volume (current week) ─────────────────────────────────
  // best_1k: fastest per-km pace across run segments in the ~1 km band, scaled to
  // exactly 1 km (so an 1100 m segment competes fairly). Only finished segments
  // with both bounds and a positive distance qualify.
  const bestRows = await client<Array<{ best_s_per_km: string | null }>>`
    with run_segs as (
      select
        se.distance_meters::float as dist,
        extract(epoch from (se.ended_at - se.started_at))::float as dur,
        se.avg_pace_s_per_km::float as explicit_pace
      from segment_executions se
      join workout_executions we on we.id = se.execution_id
      left join template_segments ts on ts.id = se.template_segment_id
      left join exercises ex on ex.id = ts.exercise_id
      where we.athlete_id = ${athleteId}
        and ${mod} = 'run'
        and coalesce(we.ended_at, we.started_at) >= now() - (${ANALYTICS_WINDOW_DAYS} || ' days')::interval
    )
    select min(
      coalesce(
        explicit_pace,
        case
          when dist between ${ONE_KM_MIN_METERS} and ${ONE_KM_MAX_METERS}
            and dur > 0 then dur / (dist / 1000.0)
          else null
        end
      )
    )::float as best_s_per_km
    from run_segs
    where dist between ${ONE_KM_MIN_METERS} and ${ONE_KM_MAX_METERS} and dur > 0
  `;
  const best_1k = paceStr(bestRows[0]?.best_s_per_km != null ? num(bestRows[0].best_s_per_km) : null);

  // weekly_volume_km: distance in the current ISO week (Monday start). This is a
  // fallback — the view prefers the live StatsService figure — but we provide it
  // so the endpoint is self-sufficient.
  const weekVolRows = await client<Array<{ meters: string | null }>>`
    select sum(coalesce(se.distance_meters, 0))::float as meters
    from segment_executions se
    join workout_executions we on we.id = se.execution_id
    left join template_segments ts on ts.id = se.template_segment_id
    left join exercises ex on ex.id = ts.exercise_id
    where we.athlete_id = ${athleteId}
      and ${mod} = 'run'
      and coalesce(we.ended_at, we.started_at) >= date_trunc('week', now())
  `;
  const weekly_volume_km = kmStr(weekVolRows[0]?.meters != null ? num(weekVolRows[0].meters) : 0);

  // volume_7d_km: rolling last-7-days running distance — the Inicio "Volumen ·
  // 7 días" figure. Same run-modality filter as above; only the window differs
  // (a moving 7-day window vs the ISO week), so the two labels never lie.
  const vol7Rows = await client<Array<{ meters: string | null }>>`
    select sum(coalesce(se.distance_meters, 0))::float as meters
    from segment_executions se
    join workout_executions we on we.id = se.execution_id
    left join template_segments ts on ts.id = se.template_segment_id
    left join exercises ex on ex.id = ts.exercise_id
    where we.athlete_id = ${athleteId}
      and ${mod} = 'run'
      and coalesce(we.ended_at, we.started_at) >= now() - interval '7 days'
  `;
  const volume_7d_km = kmStr(vol7Rows[0]?.meters != null ? num(vol7Rows[0].meters) : 0);

  // ── Splits: the most recent run execution's per-km segments ────────────────
  const lastRunExecRows = await client<Array<{ execution_id: string }>>`
    select we.id::text as execution_id
    from workout_executions we
    where we.athlete_id = ${athleteId}
      and exists (
        select 1
        from segment_executions se
        left join template_segments ts on ts.id = se.template_segment_id
        left join exercises ex on ex.id = ts.exercise_id
        where se.execution_id = we.id and ${mod} = 'run'
      )
    order by coalesce(we.ended_at, we.started_at) desc
    limit 1
  `;
  const lastExecId = lastRunExecRows[0] ? Number(lastRunExecRows[0].execution_id) : null;

  let splits: RunningSplitDTO[] = [];
  let split_drop_note: string | null = null;

  if (lastExecId != null) {
    const splitRows = await client<
      Array<{
        position: number;
        pace_s_per_km: string | null;
        cadence_spm: number | null;
        incline_pct: string | null;
      }>
    >`
      select
        se.position,
        coalesce(
          se.avg_pace_s_per_km::float,
          case
            when se.distance_meters > 0
              and se.started_at is not null and se.ended_at is not null
            then extract(epoch from (se.ended_at - se.started_at))::float
                 / (se.distance_meters::float / 1000.0)
            else null
          end
        ) as pace_s_per_km,
        se.run_cadence_spm as cadence_spm,
        se.incline_pct::text as incline_pct
      from segment_executions se
      left join template_segments ts on ts.id = se.template_segment_id
      left join exercises ex on ex.id = ts.exercise_id
      where se.execution_id = ${lastExecId}
        and ${mod} = 'run'
      order by se.position asc
    `;

    const paced = splitRows
      .map((r) => ({
        position: r.position,
        pace: r.pace_s_per_km != null ? num(r.pace_s_per_km) : null,
        cadence: r.cadence_spm != null ? Number(r.cadence_spm) : null,
        incline: r.incline_pct != null ? num(r.incline_pct) : null,
      }))
      .filter(
        (r): r is { position: number; pace: number; cadence: number | null; incline: number | null } =>
          r.pace != null && r.pace > 0,
      );

    if (paced.length > 0) {
      const best = Math.min(...paced.map((p) => p.pace));
      const worst = Math.max(...paced.map((p) => p.pace));
      // Bars: taller = slower (per the iOS handoff). Normalize to the slowest km.
      splits = paced.map((p, i) => ({
        id: `k${i + 1}`,
        label: `k${i + 1}`,
        pace: paceStr(p.pace),
        height: worst > 0 ? Math.max(0.15, Math.min(1, p.pace / worst)) : 0.5,
        severity: severityVsBest(p.pace, best),
        cadence_spm: p.cadence,
        incline_pct: p.incline,
      }));

      // Final-drift note: compare the second-half average pace to the first-half.
      if (paced.length >= 4) {
        const mid = Math.floor(paced.length / 2);
        const firstAvg = paced.slice(0, mid).reduce((a, b) => a + b.pace, 0) / mid;
        const secondAvg =
          paced.slice(mid).reduce((a, b) => a + b.pace, 0) / (paced.length - mid);
        const driftSPerKm = Math.round(secondAvg - firstAvg);
        if (driftSPerKm >= SPLIT_DRIFT_NOTE_S_PER_KM) {
          split_drop_note = `+${driftSPerKm}s/km en la segunda mitad`;
        }
      }
    }
  }

  // ── Progression: representative run pace per ISO week ───────────────────────
  // Per week, the volume-weighted average running pace (total run time / total
  // run distance). Taller bar = slower (per iOS handoff); the latest week is the
  // accented "current" bar. We surface the last PROGRESSION_WEEKS weeks that have
  // any running.
  const progRows = await client<
    Array<{ week_start: string; pace_s_per_km: string | null }>
  >`
    select
      to_char(date_trunc('week', coalesce(we.ended_at, we.started_at))::date, 'YYYY-MM-DD') as week_start,
      case
        when sum(coalesce(se.distance_meters, 0)) > 0
        then sum(
               coalesce(extract(epoch from (se.ended_at - se.started_at)), 0)
             )::float / (sum(coalesce(se.distance_meters, 0))::float / 1000.0)
        else null
      end as pace_s_per_km
    from segment_executions se
    join workout_executions we on we.id = se.execution_id
    left join template_segments ts on ts.id = se.template_segment_id
    left join exercises ex on ex.id = ts.exercise_id
    where we.athlete_id = ${athleteId}
      and ${mod} = 'run'
      and coalesce(we.ended_at, we.started_at) >= now() - (${ANALYTICS_WINDOW_DAYS} || ' days')::interval
    group by 1
    having sum(coalesce(se.distance_meters, 0)) > 0
    order by 1 asc
  `;

  const progPaced = progRows
    .map((r) => ({ pace: r.pace_s_per_km != null ? num(r.pace_s_per_km) : null }))
    .filter((r): r is { pace: number } => r.pace != null && r.pace > 0)
    .slice(-PROGRESSION_WEEKS);

  let progression: RunningProgressionPointDTO[] = [];
  if (progPaced.length > 0) {
    const slowest = Math.max(...progPaced.map((p) => p.pace));
    progression = progPaced.map((p, i) => ({
      id: `w${i + 1}`,
      height: slowest > 0 ? Math.max(0.15, Math.min(1, p.pace / slowest)) : 0.5,
      pace: paceStr(p.pace),
      current: i === progPaced.length - 1,
    }));
  }

  // training: left empty — see header note (no clean single source for the
  // session→station linkage here; the view hides the section on []).
  const training: TrainingLinkDTO[] = [];

  return {
    threshold_pace,
    vo2_estimate,
    best_1k,
    weekly_volume_km,
    volume_7d_km,
    five_k_trend,
    splits,
    split_drop_note,
    pace_zones,
    progression,
    training,
  };
}
