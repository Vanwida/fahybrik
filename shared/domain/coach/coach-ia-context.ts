import type { Sql } from 'postgres';
import { getCurrentMicrociclo } from './current-microciclo';
import { getTargetRaceRow } from './target-race';
import { addDays, isoDateString, startOfDayInBox } from '../dates';
import { computeAthleteDailyReadiness } from './athlete-daily-readiness';

export type ProgressionVerdict = 'up' | 'flat' | 'down';

export type AthleteContextPack = {
  identity: {
    level: string | null;
    block_type: string | null;
    week_in_block: number | null;
    days_to_a_event: number | null;
  };
  compliance: {
    pct_7d: number | null;
    pct_28d: number | null;
    missed_7d: number;
  };
  readiness: {
    score: number | null;
    sub_score: number | null;
    delta_7d: number | null;
    /** HRV last 7d vs 14-60d baseline as fraction (e.g. -0.18 = -18%). null if no data. */
    hrv_delta_pct: number | null;
  };
  effort: {
    avg_rpe_7d: number | null;
    high_rpe_sessions_7d: number;
  };
  running: {
    status: 'better' | 'same' | 'worse' | 'unknown' | 'flat' | null;
    detail: string | null;
  };
  hyrox: { weak: string[]; strong: string[] };
  subjective_snippets: string[];
  progression_verdict: ProgressionVerdict;
  summary: string;
  compliance_7d: number | null;
  readiness_sub_score: number | null;
  data_gaps: string[];
};

export async function buildAthleteContextPack(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client: Sql;
}): Promise<AthleteContextPack> {
  const client = params.client;
  const today = startOfDayInBox(params.on_date ?? new Date());
  const todayIso = isoDateString(today);
  const weekAgoIso = isoDateString(addDays(today, -7));
  const monthAgoIso = isoDateString(addDays(today, -28));

  const micro = await getCurrentMicrociclo({
    athlete_id: params.athlete_id,
    on_date: today,
    client,
  });

  const levelRows = await client<Array<{ level: string | null }>>`
    select intake_notes_json ->> 'level' as level
    from athletes where id = ${params.athlete_id as number} limit 1
  `;

  // Días hasta la carrera objetivo (unified `races` spine, priority='target').
  const targetRace = await getTargetRaceRow(params.athlete_id, client, today);

  const complianceRows = await client<
    Array<{ scheduled_7d: number; completed_7d: number; scheduled_28d: number; completed_28d: number; missed_7d: number }>
  >`
    select
      count(*) filter (
        where wa.scheduled_for >= ${weekAgoIso}::date and wa.scheduled_for <= ${todayIso}::date
      )::int as scheduled_7d,
      count(*) filter (
        where wa.scheduled_for >= ${weekAgoIso}::date and wa.scheduled_for <= ${todayIso}::date
          and wa.status = 'completed'
      )::int as completed_7d,
      count(*) filter (
        where wa.scheduled_for >= ${monthAgoIso}::date and wa.scheduled_for <= ${todayIso}::date
      )::int as scheduled_28d,
      count(*) filter (
        where wa.scheduled_for >= ${monthAgoIso}::date and wa.scheduled_for <= ${todayIso}::date
          and wa.status = 'completed'
      )::int as completed_28d,
      count(*) filter (
        where wa.status = 'missed'
          and wa.scheduled_for >= ${weekAgoIso}::date and wa.scheduled_for <= ${todayIso}::date
      )::int as missed_7d
    from workout_assignments wa
    where wa.athlete_id = ${params.athlete_id as number}
  `;
  const c = complianceRows[0];
  const pct7 =
    c && c.scheduled_7d > 0 ? Math.round((c.completed_7d / c.scheduled_7d) * 100) / 100 : null;
  const pct28 =
    c && c.scheduled_28d > 0 ? Math.round((c.completed_28d / c.scheduled_28d) * 100) / 100 : null;

  const checkinRows = await client<Array<{ sub_score: number; notes: string | null }>>`
    select sub_score, notes from daily_checkins
    where athlete_id = ${params.athlete_id as number}
      and recorded_for = ${todayIso}::date
    limit 1
  `;
  const subScore = checkinRows[0]?.sub_score ?? null;

  let readinessScore: number | null = null;
  let readinessDelta7d: number | null = null;
  try {
    const snap = await computeAthleteDailyReadiness({
      athlete_id: params.athlete_id,
      recorded_for: todayIso,
      client,
    });
    // null when the athlete has no real readiness signal yet — leave the
    // score/delta null rather than surfacing an invented number to the IA.
    readinessScore = snap?.score ?? null;
    readinessDelta7d = snap?.delta_7d ?? null;
  } catch {
    // readiness optional until data exists
  }

  const rpeRows = await client<Array<{ avg_rpe: number | null; high_count: number }>>`
    select
      avg(we.perceived_exertion)::float as avg_rpe,
      count(*) filter (where we.perceived_exertion >= 9)::int as high_count
    from workout_executions we
    where we.athlete_id = ${params.athlete_id as number}
      and coalesce(we.ended_at, we.started_at, we.created_at)::date >= ${weekAgoIso}::date
  `;

  const hrvRows = await client<Array<{ recent: number | null; baseline: number | null }>>`
    select
      (select avg(value_numeric)::float from biometric_streams
        where athlete_id = ${params.athlete_id as number} and metric_type = 'hrv'
          and recorded_at >= now() - interval '7 days') as recent,
      (select avg(value_numeric)::float from biometric_streams
        where athlete_id = ${params.athlete_id as number} and metric_type = 'hrv'
          and recorded_at >= now() - interval '60 days'
          and recorded_at < now() - interval '14 days') as baseline
  `;
  const hrvRecent = hrvRows[0]?.recent;
  const hrvBaseline = hrvRows[0]?.baseline;
  const hrvDeltaPct =
    hrvRecent != null && hrvBaseline != null && hrvBaseline > 0
      ? (hrvRecent - hrvBaseline) / hrvBaseline
      : null;

  const subjective: string[] = [];
  if (checkinRows[0]?.notes) {
    subjective.push(truncate(checkinRows[0].notes, 120));
  }
  const execNotes = await client<Array<{ notes: string }>>`
    select notes from workout_executions
    where athlete_id = ${params.athlete_id as number}
      and notes is not null and notes <> ''
      and coalesce(ended_at, started_at, created_at) >= now() - interval '7 days'
    order by coalesce(ended_at, started_at, created_at) desc
    limit 2
  `;
  for (const n of execNotes) subjective.push(truncate(n.notes, 120));

  const runningSignal = await computeRunningSignal({
    athlete_id: params.athlete_id,
    today_iso: todayIso,
    client,
  });

  const hyroxSignal = await computeHyroxSignal({
    athlete_id: params.athlete_id,
    today_iso: todayIso,
    client,
  });

  const dataGaps: string[] = [];
  if (rpeRows[0]?.avg_rpe == null) dataGaps.push('rpe');
  if (hrvRecent == null) dataGaps.push('hrv');
  if (subScore == null) dataGaps.push('checkin');

  const progression = computeProgressionVerdict({
    compliance_7d: pct7,
    hrv_delta_pct: hrvDeltaPct,
    sub_score: subScore,
    readiness_score: readinessScore,
    missed_7d: c?.missed_7d ?? 0,
  });

  const summaryParts: string[] = [];
  if (pct7 != null) summaryParts.push(`Cumplimiento ${Math.round(pct7 * 100)}% 7d`);
  if (hrvDeltaPct != null) summaryParts.push(`HRV ${hrvDeltaPct >= 0 ? '+' : ''}${Math.round(hrvDeltaPct * 100)}%`);
  if (subScore != null) summaryParts.push(`Check-in ${subScore}/100`);
  if (readinessScore != null) summaryParts.push(`Readiness ${readinessScore}`);
  const summary = summaryParts.slice(0, 5).join('; ') || 'Datos limitados esta semana';

  return {
    identity: {
      level: levelRows[0]?.level ?? null,
      block_type: micro?.name ?? null,
      week_in_block: micro?.week_index ?? null,
      days_to_a_event: targetRace?.days_until ?? null,
    },
    compliance: {
      pct_7d: pct7,
      pct_28d: pct28,
      missed_7d: c?.missed_7d ?? 0,
    },
    readiness: {
      score: readinessScore,
      sub_score: subScore,
      delta_7d: readinessDelta7d,
      hrv_delta_pct: hrvDeltaPct,
    },
    effort: {
      avg_rpe_7d: rpeRows[0]?.avg_rpe ?? null,
      high_rpe_sessions_7d: rpeRows[0]?.high_count ?? 0,
    },
    running: runningSignal,
    hyrox: hyroxSignal,
    subjective_snippets: subjective.slice(0, 3),
    progression_verdict: progression,
    summary,
    compliance_7d: pct7,
    readiness_sub_score: subScore,
    data_gaps: dataGaps,
  };
}

function computeProgressionVerdict(input: {
  compliance_7d: number | null;
  hrv_delta_pct: number | null;
  sub_score: number | null;
  readiness_score: number | null;
  missed_7d: number;
}): ProgressionVerdict {
  const bad =
    (input.compliance_7d != null && input.compliance_7d < 0.6) ||
    (input.hrv_delta_pct != null && input.hrv_delta_pct < -0.15) ||
    (input.sub_score != null && input.sub_score < 40) ||
    (input.readiness_score != null && input.readiness_score < 45) ||
    input.missed_7d >= 2;

  if (bad) return 'down';
  if (input.compliance_7d != null && input.compliance_7d >= 0.85) return 'up';
  return 'flat';
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/**
 * Running domain signal. Compares avg pace (s/km) over last 14d vs
 * the 16d prior (days 15-30). Looks only at sessions whose template
 * references a running exercise (slug LIKE 'run-%' or category cardio
 * + equipment 'running').
 *
 * Pace = total_duration_seconds / (distance_meters / 1000), aggregated
 * across segment_executions for each workout_execution.
 *
 * Status:
 *  - 'better' if recent pace is faster by ≥3 s/km
 *  - 'worse'  if recent pace is slower by ≥3 s/km
 *  - 'same'   if delta within ±3 s/km
 *  - 'unknown' if either window has <2 sessions with valid distance+time
 */
async function computeRunningSignal(params: {
  athlete_id: number | bigint;
  today_iso: string;
  client: Sql;
}): Promise<AthleteContextPack['running']> {
  const { athlete_id, today_iso, client } = params;
  const rows = await client<
    Array<{
      window: 'recent' | 'prior';
      sessions: number;
      avg_pace_s_per_km: number | null;
    }>
  >`
    with run_segments as (
      select
        we.id as execution_id,
        coalesce(we.ended_at, we.started_at, we.created_at)::date as run_date,
        sum(se.distance_meters)::float as meters,
        sum(extract(epoch from (se.ended_at - se.started_at)))::float as seconds
      from workout_executions we
      join segment_executions se on se.execution_id = we.id
      join template_segments ts on ts.id = se.template_segment_id
      join exercises ex on ex.id = ts.exercise_id
      where we.athlete_id = ${athlete_id as number}
        and (ex.slug like 'run-%' or (ex.category = 'cardio' and 'running' = any(ex.equipment)))
        and coalesce(we.ended_at, we.started_at, we.created_at)::date
            >= ${today_iso}::date - interval '30 days'
        and se.distance_meters is not null
        and se.started_at is not null
        and se.ended_at is not null
      group by we.id, run_date
      having sum(se.distance_meters) > 500
         and sum(extract(epoch from (se.ended_at - se.started_at))) > 60
    ),
    windows as (
      select
        case
          when run_date >= ${today_iso}::date - interval '14 days' then 'recent'
          else 'prior'
        end as "window",
        seconds / (meters / 1000.0) as pace_s_per_km
      from run_segments
    )
    select
      "window",
      count(*)::int as sessions,
      avg(pace_s_per_km)::float as avg_pace_s_per_km
    from windows
    group by "window"
  `;

  const recent = rows.find((r) => r.window === 'recent');
  const prior = rows.find((r) => r.window === 'prior');

  if (
    !recent ||
    !prior ||
    recent.sessions < 2 ||
    prior.sessions < 2 ||
    recent.avg_pace_s_per_km == null ||
    prior.avg_pace_s_per_km == null
  ) {
    return { status: 'unknown', detail: 'sin datos suficientes' };
  }

  const deltaSPerKm = recent.avg_pace_s_per_km - prior.avg_pace_s_per_km;
  const absDelta = Math.round(Math.abs(deltaSPerKm));
  const signLabel = deltaSPerKm < 0 ? `-${absDelta}s/km` : `+${absDelta}s/km`;

  let status: 'better' | 'same' | 'worse';
  if (deltaSPerKm <= -3) status = 'better';
  else if (deltaSPerKm >= 3) status = 'worse';
  else status = 'same';

  return {
    status,
    detail: `pace ${signLabel} 14d vs días 15-30 (${recent.sessions}/${prior.sessions} sesiones)`,
  };
}

/**
 * HYROX stations signal. Looks at the 8 canonical HYROX stations
 * (category = 'hyrox_station' in exercises catalog). For each station
 * with at least one execution in the last 8 weeks:
 *  - strong[] if best recent (last 2 weeks) > median of the prior 6 weeks
 *  - weak[]   if best recent is worse OR the most recent assignment was missed
 *
 * "Best" metric per station: reps_completed if present, else
 * inverse of total segment duration (faster = better).
 */
async function computeHyroxSignal(params: {
  athlete_id: number | bigint;
  today_iso: string;
  client: Sql;
}): Promise<AthleteContextPack['hyrox']> {
  const { athlete_id, today_iso, client } = params;

  const rows = await client<
    Array<{
      exercise_slug: string;
      exercise_name: string;
      window: 'recent' | 'prior';
      best_reps: number | null;
      best_duration_s: number | null;
      median_reps: number | null;
      median_duration_s: number | null;
      missed_recent: number;
    }>
  >`
    with station_segments as (
      select
        ex.slug as exercise_slug,
        ex.name as exercise_name,
        coalesce(we.ended_at, we.started_at, we.created_at)::date as exec_date,
        case
          when coalesce(we.ended_at, we.started_at, we.created_at)::date
               >= ${today_iso}::date - interval '14 days' then 'recent'
          else 'prior'
        end as "window",
        se.reps_completed,
        case
          when se.started_at is not null and se.ended_at is not null
            then extract(epoch from (se.ended_at - se.started_at))::float
          else null
        end as duration_s
      from workout_executions we
      join segment_executions se on se.execution_id = we.id
      join template_segments ts on ts.id = se.template_segment_id
      join exercises ex on ex.id = ts.exercise_id
      where we.athlete_id = ${athlete_id as number}
        and ex.category = 'hyrox_station'
        and coalesce(we.ended_at, we.started_at, we.created_at)::date
            >= ${today_iso}::date - interval '56 days'
    ),
    missed_recent as (
      select ts.exercise_id, count(*)::int as missed_count
      from workout_assignments wa
      join templates t on t.id = wa.template_id
      join template_segments ts on ts.template_id = t.id
      where wa.athlete_id = ${athlete_id as number}
        and wa.status = 'missed'
        and wa.scheduled_for >= ${today_iso}::date - interval '14 days'
      group by ts.exercise_id
    ),
    agg as (
      select
        exercise_slug,
        exercise_name,
        "window",
        max(reps_completed) as best_reps,
        min(duration_s) as best_duration_s,
        percentile_cont(0.5) within group (order by reps_completed) as median_reps,
        percentile_cont(0.5) within group (order by duration_s) as median_duration_s
      from station_segments
      group by exercise_slug, exercise_name, "window"
    )
    select
      a.exercise_slug,
      a.exercise_name,
      a.window,
      a.best_reps::float as best_reps,
      a.best_duration_s::float as best_duration_s,
      a.median_reps::float as median_reps,
      a.median_duration_s::float as median_duration_s,
      coalesce((
        select mr.missed_count from missed_recent mr
        join exercises ex on ex.id = mr.exercise_id
        where ex.slug = a.exercise_slug
      ), 0)::int as missed_recent
    from agg a
  `;

  const byStation = new Map<
    string,
    {
      name: string;
      recent?: { best_reps: number | null; best_duration_s: number | null };
      prior?: { median_reps: number | null; median_duration_s: number | null };
      missed_recent: number;
    }
  >();

  for (const r of rows) {
    const entry = byStation.get(r.exercise_slug) ?? {
      name: r.exercise_name,
      missed_recent: r.missed_recent,
    };
    if (r.window === 'recent') {
      entry.recent = { best_reps: r.best_reps, best_duration_s: r.best_duration_s };
      entry.missed_recent = r.missed_recent;
    } else {
      entry.prior = {
        median_reps: r.median_reps,
        median_duration_s: r.median_duration_s,
      };
    }
    byStation.set(r.exercise_slug, entry);
  }

  const weak: string[] = [];
  const strong: string[] = [];

  for (const [slug, st] of byStation) {
    // Sessions failed/missed in last 2 weeks → weak signal
    if (st.missed_recent > 0) {
      weak.push(slug);
      continue;
    }
    if (!st.recent || !st.prior) continue;

    // Prefer reps comparison when both windows have reps data
    if (
      st.recent.best_reps != null &&
      st.prior.median_reps != null &&
      st.prior.median_reps > 0
    ) {
      if (st.recent.best_reps > st.prior.median_reps) strong.push(slug);
      else if (st.recent.best_reps < st.prior.median_reps) weak.push(slug);
      continue;
    }

    // Otherwise fall back to duration (lower is better)
    if (
      st.recent.best_duration_s != null &&
      st.prior.median_duration_s != null &&
      st.prior.median_duration_s > 0
    ) {
      if (st.recent.best_duration_s < st.prior.median_duration_s) strong.push(slug);
      else if (st.recent.best_duration_s > st.prior.median_duration_s) weak.push(slug);
    }
  }

  return {
    weak: weak.slice(0, 5),
    strong: strong.slice(0, 5),
  };
}

/** Alias for plan naming. */
export const buildCoachIaContextPack = buildAthleteContextPack;
