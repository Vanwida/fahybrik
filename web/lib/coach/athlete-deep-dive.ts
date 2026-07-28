// Athlete deep-dive payload builder. Composes data from:
//   - athletes / target race (races, priority='target') / events
//   - current microciclo (athlete_month_assignments) + progress readiness
//   - training_load (CTL/ATL/TSB series + load summary)
//   - workout_executions / workout_assignments / segment_executions
//   - biometric_streams (HRV, sleep, RHR, recovery)
//   - athlete_benchmarks (1RMs)
//   - athlete_coach_notes (private to coach)
//
// Real data from the database is preferred. When an athlete has no executions
// yet OR the URL points at a `demo-N` ID, we fall back to canned demo data
// (see deep-dive-demo.ts) — same `is_demo` pattern as the cohort.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { getCurrentMicrociclo } from '@fahybrid/shared/domain/coach/current-microciclo';
import { getTargetRaceRow } from '@fahybrid/shared/domain/coach/target-race';
import { assessAthleteProgressReadiness } from '@fahybrid/shared/domain/coach/progress-readiness';
import { estimateRaceReadiness } from '@fahybrid/shared/domain/coach/race-readiness';
import {
  computeAcr,
  computeLoadSeries,
  getDailyTssSeries,
  readLoadCoverage,
  summarizeLoad,
} from '@/lib/training-load';
import type { DailyTss, LoadCoverage } from '@/lib/training-load';
import { loadAthleteHrZones } from '@/lib/athlete/hr-zones';
import { HR_ANCHOR_LABEL, zoneForBpm } from '@fahybrid/shared/domain/methodology';
import {
  getDemoDeepDive,
  getDemoFallback,
  isDemoAthleteId,
} from './deep-dive-demo';
import { getLatestReadiness } from './athlete-daily-readiness';
import {
  loadRestingHrDays,
  resolveRestingHrOn,
} from '@fahybrid/shared/domain/biometrics/resting-hr';
import type {
  AEvent,
  AthleteDeepDive,
  AthleteHeader,
  CoachNote,
  CompliancePoint,
  CtlAtlPoint,
  DeepDiveBanner,
  KpiCarga,
  KpiCompliance,
  KpiReadiness,
  MacrocycleRibbon,
  ModalityDistribution,
  ModalityKey,
  ModalityRow,
  PerformanceBlock,
  PerformanceGroup,
  PerformanceRow,
  RecentDay,
  RecentSession,
  SparkPoint,
  TrendsBlock,
  ZoneTimeBlock,
} from './deep-dive-types';
import type { AlertReason } from '@fahybrid/shared/domain/coach/types';
import { adherenceExclusionSql } from '@/lib/coach/adherence-pause-filter';
import { joinCoachOverride } from '@/lib/exercises/coach-override';

const TRENDS_DAYS = 30;
const RECENT_DAYS = 7;
// Resting-HR baseline span: a trailing 60→14-day mean. Excluding the most recent
// 14 days keeps an acute rise from dragging down the very baseline it is compared
// against — the same shape as the HRV baseline above it.
const RHR_BASELINE_FROM_DAYS = 60;
const RHR_BASELINE_TO_DAYS = 14;

export interface BuildAthleteDeepDiveParams {
  coach_id: bigint | number;
  athlete_id: string;
  now?: Date;
  client?: Sql;
}

export class AthleteDeepDiveError extends Error {
  constructor(public code: 'not_found' | 'forbidden', message: string) {
    super(message);
    this.name = 'AthleteDeepDiveError';
  }
}

export async function buildAthleteDeepDive(
  params: BuildAthleteDeepDiveParams,
): Promise<AthleteDeepDive> {
  const now = params.now ?? new Date();

  if (isDemoAthleteId(params.athlete_id)) {
    const demo = getDemoDeepDive(params.athlete_id);
    if (!demo) {
      throw new AthleteDeepDiveError('not_found', `demo athlete ${params.athlete_id} unknown`);
    }
    return demo;
  }

  const client = params.client ?? defaultSql;
  const numericId = Number(params.athlete_id);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw new AthleteDeepDiveError('not_found', `athlete ${params.athlete_id} not found`);
  }

  const header = await loadHeader(client, numericId, params.coach_id);
  if (!header) {
    throw new AthleteDeepDiveError('not_found', `athlete ${params.athlete_id} not found`);
  }

  // Real-data signal: do we have any execution at all in the last 30d? If
  // not, the page should still look alive — fall through to demo data with
  // the real header on top so Pablo recognises the athlete.
  const exec = await client<Array<{ n: number }>>`
    select count(*)::int as n
    from workout_executions we
    where we.athlete_id = ${numericId}
      and coalesce(we.ended_at, we.started_at, we.created_at)
            >= ${isoDate(addDays(now, -TRENDS_DAYS))}::date
  `;
  const hasRealActivity = (exec[0]?.n ?? 0) > 0;

  const micro = await getCurrentMicrociclo({ athlete_id: numericId, on_date: now, client });

  if (!hasRealActivity) {
    const fallback = getDemoFallback(
      params.athlete_id,
      header.full_name,
      micro?.name ?? null,
    );
    fallback.banner = {
      kind: 'new_athlete',
      severity: 'info',
      title: 'Datos baseline en construcción',
      detail: 'primera semana es testing — los datos mostrados son ejemplo',
      cta_label: null,
    };
    return fallback;
  }

  const tssSeries = await getDailyTssSeries({
    athlete_id: numericId,
    end_date: now,
    days: 90,
    client,
  });
  const load = summarizeLoad(tssSeries);
  const { acr } = computeAcr(tssSeries);
  const loadCoverage = readLoadCoverage(load);

  const aEvent = await loadAEvent(client, numericId, now);
  const microciclos = await loadMicrociclos(client, numericId);
  const macrocycle = buildMacrocycleRibbon(microciclos, micro);
  const compliance = await loadCompliance(client, numericId, now);
  // Days with executed work in the last 7, rated or not: showing up is measured
  // by the clock, so skipping the RPE must not erase the day.
  const active_days_7d = tssSeries
    .slice(-7)
    .filter((p) => (p.known_seconds ?? 0) + (p.unknown_seconds ?? 0) > 0).length;
  const readiness = await loadReadiness(client, numericId, now, {
    tsb: load.tsb,
    coverage: loadCoverage,
    active_days_7d,
  });
  const progressReadiness = await assessAthleteProgressReadiness({
    athlete_id: numericId,
    on_date: now,
    client,
  });
  const modality = await loadModality(client, numericId, now);
  // The FULL 90-day series: the chart warms its EWMA over all of it and slices
  // the plotted tail itself, so it cannot ramp from a cold zero.
  const trends = await loadTrends(client, numericId, now, tssSeries);
  const performance = await loadPerformance(client, numericId, params.coach_id, now);
  const recent_days = await loadRecentDays(client, numericId, now);
  const notes = await loadNotes(client, numericId, params.coach_id);

  const carga = buildCarga({
    ctl: load.ctl,
    atl: load.atl,
    tsb: load.tsb,
    acr,
    // Null when there are no zones: "he spent 0 % at threshold" and "we cannot
    // tell what threshold means for him" are different sentences.
    z34_pct_7d: trends.zone_time ? trends.zone_time.pct.z3 + trends.zone_time.pct.z4 : null,
    coverage: loadCoverage,
  });

  const alerts = computeAlerts({
    hrv_delta_ms: readiness.hrv_delta_ms,
    sleep_avg_h: readiness.sleep_avg_h,
    rpe_recent: recent_days
      .flatMap((d) => d.sessions.map((s) => s.rpe))
      .filter((v): v is number => v != null),
    a_event_days: aEvent?.days_until ?? null,
  });

  const banner = computeBanner({ alerts, aEvent, hasMacrocycle: macrocycle != null });

  return {
    generated_at_iso: now.toISOString(),
    is_demo: false,
    header,
    a_event: aEvent,
    macrocycle,
    carga,
    compliance,
    readiness,
    modality,
    trends,
    performance,
    recent_days,
    notes,
    alerts,
    banner,
    transition_suggest: progressReadiness
      ? {
          recommendation: progressReadiness.recommendation,
          confidence: progressReadiness.confidence,
          reasons: progressReadiness.reasons,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

async function loadHeader(
  client: Sql,
  athlete_id: number,
  coach_id: bigint | number,
): Promise<AthleteHeader | null> {
  const rows = await client<
    Array<{
      id: string;
      full_name: string;
      dob: Date | null;
      sex: 'male' | 'female' | 'other' | null;
      height_cm: string | null;
      weight_kg: string | null;
      experience_years: string | null;
      primary_discipline: string | null;
    }>
  >`
    select
      a.id::text                   as id,
      a.full_name                  as full_name,
      a.dob                        as dob,
      a.sex                        as sex,
      a.height_cm::text            as height_cm,
      a.weight_kg::text            as weight_kg,
      a.training_experience_years::text as experience_years,
      a.primary_discipline::text   as primary_discipline
    from athletes a
    where a.id = ${athlete_id}
      and a.coach_id = ${coach_id as number}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;

  const sex_label =
    row.sex === 'male' ? 'M' : row.sex === 'female' ? 'F' : row.sex === 'other' ? 'X' : null;
  const age = ageFromDob(row.dob);
  const experience = row.experience_years ? `${trimNumStr(row.experience_years)}y entrenando` : null;
  const discipline = row.primary_discipline === 'hyrox'
    ? 'Pro'
    : row.primary_discipline === 'crossfit'
      ? 'CrossFit'
      : row.primary_discipline === 'hybrid'
        ? 'Hybrid'
        : null;
  const experience_label =
    discipline && experience ? `${discipline} · ${experience}` : experience ?? discipline;

  return {
    athlete_id: row.id,
    full_name: row.full_name,
    is_demo: false,
    age_years: age,
    sex_label,
    height_cm: row.height_cm ? Math.round(Number(row.height_cm)) : null,
    weight_kg: row.weight_kg ? round1(Number(row.weight_kg)) : null,
    experience_label,
  };
}

// ---------------------------------------------------------------------------
// A-event
// ---------------------------------------------------------------------------

async function loadAEvent(client: Sql, athlete_id: number, now: Date): Promise<AEvent | null> {
  // Target race = soonest upcoming race with priority='target' (unified spine).
  const row = await getTargetRaceRow(athlete_id, client, now);
  if (!row) return null;
  return { name: row.name, iso_date: row.race_date, days_until: row.days_until };
}

// ---------------------------------------------------------------------------
// Microciclo ribbon — one segment per assigned microciclo (agnostic).
// Each `athlete_month_assignments` row IS a microciclo: label = the coach's
// template name, span = its week count. The ORDER of the microciclos is the
// periodization (no ACC/TRANS/REAL, no fixed phases).
// ---------------------------------------------------------------------------

interface MicrocicloRow {
  id: string;
  name: string;
  week_count: number;
  start_iso: string;
  end_iso: string;
}

async function loadMicrociclos(client: Sql, athlete_id: number): Promise<MicrocicloRow[]> {
  return await client<Array<MicrocicloRow>>`
    select
      ama.id::text                                          as id,
      m.name                                                as name,
      coalesce(array_length(ama.microcycle_ids, 1), 0)::int as week_count,
      to_char(ama.start_date, 'YYYY-MM-DD')                 as start_iso,
      to_char(ama.end_date,   'YYYY-MM-DD')                 as end_iso
    from athlete_month_assignments ama
    join program_month_templates m on m.id = ama.month_template_id
    where ama.athlete_id = ${athlete_id}
    order by ama.start_date asc
  `;
}

function buildMacrocycleRibbon(
  microciclos: ReadonlyArray<MicrocicloRow>,
  current: Awaited<ReturnType<typeof getCurrentMicrociclo>>,
): MacrocycleRibbon | null {
  if (microciclos.length === 0) return null;
  const currentId = current ? String(current.assignment_id) : null;
  const blocks = microciclos.map((m, i) => ({
    type: m.name,
    weeks: m.week_count,
    position: i + 1,
    is_current: currentId != null && m.id === currentId,
  }));
  const total_weeks = microciclos.reduce((s, m) => s + m.week_count, 0);
  return {
    blocks,
    current_block: current?.name ?? null,
    current_week: current?.week_index ?? null,
    current_day_of_week: ((new Date()).getUTCDay() + 6) % 7 + 1,
    total_weeks,
    weeks_to_event: current?.weeks_to_event ?? null,
  };
}

// ---------------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------------

async function loadCompliance(
  client: Sql,
  athlete_id: number,
  now: Date,
): Promise<KpiCompliance> {
  const todayIso = isoDate(now);

  const rows = await client<Array<{ window: string; scheduled: number; completed: number }>>`
    with windows as (
      select '7d'::text as w, ${isoDate(addDays(now, -7))}::date as start
      union all select '30d', ${isoDate(addDays(now, -30))}::date
      union all select 'total', '2000-01-01'::date
    )
    select
      w.w as window,
      count(wa.id) filter (where wa.scheduled_for <= ${todayIso}::date)::int as scheduled,
      count(wa.id) filter (
        where wa.scheduled_for <= ${todayIso}::date and wa.status = 'completed'
      )::int as completed
    from windows w
    left join workout_assignments wa
      on wa.athlete_id = ${athlete_id}
     and wa.scheduled_for >= w.start
     -- #13: EXCLUDE days inside a pause (frozen) from the join so both counts drop
     -- them together; a whole paused window ⇒ scheduled 0 ⇒ pct null, not 0%.
     ${adherenceExclusionSql(client, client`wa.athlete_id`, client`wa.scheduled_for`, client`wa.injury_adaptation`)}
    group by w.w
  `;

  const byWin = new Map(rows.map((r) => [r.window, r]));
  const pct = (k: string) => {
    const r = byWin.get(k);
    if (!r || r.scheduled === 0) return null;
    return Math.round((r.completed / r.scheduled) * 100);
  };

  // Streak: count contiguous past days with no `missed` assignments.
  const streakRows = await client<Array<{ d: string; status: string }>>`
    select to_char(wa.scheduled_for, 'YYYY-MM-DD') as d, wa.status::text as status
    from workout_assignments wa
    where wa.athlete_id = ${athlete_id}
      and wa.scheduled_for <= ${todayIso}::date
    order by wa.scheduled_for desc
    limit 60
  `;
  let streak = 0;
  for (const r of streakRows) {
    if (r.status === 'missed') break;
    if (r.status === 'completed') streak += 1;
    // skip rest days (status != 'missed' but != 'completed') without breaking
  }

  const checkin = await client<Array<{ n: number }>>`
    select count(*)::int as n
    from notifications n
    where n.type = 'system'
      and n.payload_json ->> 'kind' = 'daily_checkin'
      and (n.payload_json ->> 'athlete_id')::bigint = ${athlete_id}
      and n.created_at >= ${isoDate(addDays(now, -7))}::date
  `;

  return {
    pct_7d: pct('7d'),
    pct_30d: pct('30d'),
    pct_total: pct('total'),
    streak_days: streak,
    checkin_done_7d: checkin[0]?.n ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

async function loadReadiness(
  client: Sql,
  athlete_id: number,
  now: Date,
  load: { tsb: number; coverage: LoadCoverage; active_days_7d: number },
): Promise<KpiReadiness> {
  const rows = await client<
    Array<{
      hrv_recent: number | null;
      hrv_baseline: number | null;
      sleep_h: number | null;
      recovery: number | null;
    }>
  >`
    with hrv_recent as (
      select avg(value_numeric)::float as v from biometric_streams
      where athlete_id = ${athlete_id} and metric_type = 'hrv'
        and recorded_at >= ${addDays(now, -7).toISOString()}::timestamptz
    ),
    hrv_baseline as (
      select avg(value_numeric)::float as v from biometric_streams
      where athlete_id = ${athlete_id} and metric_type = 'hrv'
        and recorded_at >= ${addDays(now, -60).toISOString()}::timestamptz
        and recorded_at <  ${addDays(now, -14).toISOString()}::timestamptz
    ),
    sleep_avg as (
      select avg(value_numeric)::float / 3600.0 as v from biometric_streams
      where athlete_id = ${athlete_id} and metric_type = 'sleep_duration'
        and recorded_at >= ${addDays(now, -7).toISOString()}::timestamptz
    ),
    recovery_recent as (
      select avg(value_numeric)::float as v from biometric_streams
      where athlete_id = ${athlete_id} and metric_type = 'recovery'
        and recorded_at >= ${addDays(now, -3).toISOString()}::timestamptz
    )
    select
      (select v from hrv_recent)    as hrv_recent,
      (select v from hrv_baseline)  as hrv_baseline,
      (select v from sleep_avg)     as sleep_h,
      (select v from recovery_recent) as recovery
  `;
  const r = rows[0];
  const hrv_ms = r?.hrv_recent != null ? Math.round(r.hrv_recent) : null;
  const hrv_delta_ms =
    r?.hrv_recent != null && r?.hrv_baseline != null
      ? Math.round(r.hrv_recent - r.hrv_baseline)
      : null;
  // Resting HR through THE resolver over the whole baseline span: the KPI is the
  // athlete's CURRENT resting HR (the same number the roster and the athlete's own
  // app show), not a 7-day average that smeared it — and its delta is against the
  // 60→14-day mean of the daily winners, so a revised day counts once, not twice.
  const rhrDays = await loadRestingHrDays({
    athlete_id,
    from_iso: isoDate(addDays(now, -RHR_BASELINE_FROM_DAYS)),
    to_iso: isoDate(now),
    client,
  });
  const rhrNow = resolveRestingHrOn(rhrDays, isoDate(now));
  const rhrBaselineDays = rhrDays.filter(
    (d) => d.on < isoDate(addDays(now, -RHR_BASELINE_TO_DAYS)),
  );
  const rhrBaseline =
    rhrBaselineDays.length > 0
      ? rhrBaselineDays.reduce((s, d) => s + d.bpm, 0) / rhrBaselineDays.length
      : null;
  const rhr = rhrNow != null ? Math.round(rhrNow.bpm) : null;
  const rhr_delta =
    rhrNow != null && rhrBaseline != null ? Math.round(rhrNow.bpm - rhrBaseline) : null;
  const sleep_avg_h = r?.sleep_h != null ? round1(r.sleep_h) : null;
  const recovery_pct = r?.recovery != null ? Math.round(r.recovery) : null;

  // Mood/fatigue: best-effort lookup against latest daily check-in payload.
  const mood = await loadLatestCheckinMetric(client, athlete_id, 'mood');
  const fatigue = await loadLatestCheckinMetric(client, athlete_id, 'fatigue');

  // Race readiness composite — literally the same function the roster calls
  // (shared/domain/coach/race-readiness.ts), fed from the load reading this page
  // already computed. It used to be a second copy of the formula here, working
  // off a THIRD query of the same 90-day series, and the two copies had drifted:
  // this one could never return null and let a missing TSB score 20 of its 40
  // freshness points.
  const compliance7 = await loadCompliancePct(client, athlete_id, now, 7);
  const race_readiness = estimateRaceReadiness({
    tsb: load.tsb,
    compliance_pct: compliance7,
    hrv_delta_ms,
    active_days_7d: load.active_days_7d,
    load_coverage: load.coverage,
  });
  const daily = await getLatestReadiness({ athlete_id, on_date: now, client });

  return {
    daily_readiness_score: daily?.score ?? null,
    daily_readiness_delta_7d: daily?.delta_7d ?? null,
    race_readiness,
    race_readiness_trend: hrv_delta_ms != null && hrv_delta_ms < -5 ? 'down' : 'flat',
    hrv_ms,
    hrv_delta_ms,
    sleep_avg_h,
    rhr,
    rhr_delta,
    recovery_pct,
    mood,
    fatigue,
  };
}

async function loadLatestCheckinMetric(
  client: Sql,
  athlete_id: number,
  key: string,
): Promise<number | null> {
  const rows = await client<Array<{ v: number | null }>>`
    select (n.payload_json -> 'metrics' ->> ${key})::float as v
    from notifications n
    where n.type = 'system'
      and n.payload_json ->> 'kind' = 'daily_checkin'
      and (n.payload_json ->> 'athlete_id')::bigint = ${athlete_id}
    order by n.created_at desc
    limit 1
  `;
  const v = rows[0]?.v;
  return v == null ? null : Math.round(v);
}

async function loadCompliancePct(
  client: Sql,
  athlete_id: number,
  now: Date,
  days: number,
): Promise<number | null> {
  const startIso = isoDate(addDays(now, -days));
  const todayIso = isoDate(now);
  const rows = await client<Array<{ scheduled: number; completed: number }>>`
    select
      count(*) filter (where wa.scheduled_for <= ${todayIso}::date)::int as scheduled,
      count(*) filter (
        where wa.scheduled_for <= ${todayIso}::date and wa.status = 'completed'
      )::int as completed
    from workout_assignments wa
    where wa.athlete_id = ${athlete_id}
      and wa.scheduled_for >= ${startIso}::date
      -- #13: EXCLUDE days inside a pause (frozen) from the row source; a whole
      -- paused window ⇒ scheduled 0 ⇒ null, never a punitive 0%.
      ${adherenceExclusionSql(client, client`wa.athlete_id`, client`wa.scheduled_for`, client`wa.injury_adaptation`)}
  `;
  const r = rows[0];
  if (!r || r.scheduled === 0) return null;
  return Math.round((r.completed / r.scheduled) * 100);
}

// ---------------------------------------------------------------------------
// Modality distribution last 7d
// ---------------------------------------------------------------------------

async function loadModality(
  client: Sql,
  athlete_id: number,
  now: Date,
): Promise<ModalityDistribution> {
  const sinceIso = addDays(now, -RECENT_DAYS).toISOString();
  // Sum seconds + km + kg per exercise category, plus session count + 2x/day days.
  const rows = await client<
    Array<{
      category: string | null;
      seconds: number;
      meters: number | null;
      kg_volume: number | null;
    }>
  >`
    with sessions as (
      select we.id, we.athlete_id, coalesce(we.ended_at, we.started_at, we.created_at) as ts
      from workout_executions we
      where we.athlete_id = ${athlete_id}
        and coalesce(we.ended_at, we.started_at, we.created_at) >= ${sinceIso}
    )
    select
      ex.category::text as category,
      coalesce(sum(extract(epoch from coalesce(se.ended_at - se.started_at, interval '0'))), 0)::int as seconds,
      coalesce(sum(coalesce(se.distance_meters, 0)), 0)::float as meters,
      coalesce(sum(coalesce(se.weight_used_kg, 0) * coalesce(se.reps_completed, 0)), 0)::float as kg_volume
    from segment_executions se
    join sessions s on s.id = se.execution_id
    left join template_segments ts on ts.id = se.template_segment_id
    left join exercises ex on ex.id = ts.exercise_id
    group by ex.category
  `;

  // sessions_count + 2x/day days
  const dayRows = await client<Array<{ d: string; n: number }>>`
    select to_char(coalesce(we.ended_at, we.started_at, we.created_at)::date, 'YYYY-MM-DD') as d,
           count(*)::int as n
    from workout_executions we
    where we.athlete_id = ${athlete_id}
      and coalesce(we.ended_at, we.started_at, we.created_at) >= ${sinceIso}
    group by 1
    order by 1 desc
  `;

  const totalSeconds = rows.reduce((s, r) => s + (r.seconds ?? 0), 0);
  const totalHours = totalSeconds / 3600;

  const map: Record<ModalityKey, ModalityRow> = {
    running:   { key: 'running',  label: 'Running',     hours: 0, pct: 0, km: 0,  kg: null },
    strength:  { key: 'strength', label: 'Strength',    hours: 0, pct: 0, km: null, kg: 0 },
    hyrox:     { key: 'hyrox',    label: 'HYROX-spec',  hours: 0, pct: 0, km: null, kg: null },
    skill:     { key: 'skill',    label: 'Skill/Mob',   hours: 0, pct: 0, km: null, kg: null },
    recovery:  { key: 'recovery', label: 'Recovery',    hours: 0, pct: 0, km: null, kg: null },
  };

  for (const r of rows) {
    const key = mapCategoryToModality(r.category);
    if (!key) continue;
    const target = map[key];
    target.hours = round2(target.hours + (r.seconds ?? 0) / 3600);
    target.pct = totalSeconds > 0 ? Math.round(((r.seconds ?? 0) / totalSeconds) * 100) : 0;
    if (key === 'running' && r.meters != null) {
      target.km = round1((target.km ?? 0) + r.meters / 1000);
    }
    if (key === 'strength' && r.kg_volume != null) {
      target.kg = Math.round((target.kg ?? 0) + r.kg_volume);
    }
  }

  const sessionsCount = dayRows.reduce((s, d) => s + d.n, 0);
  const twiceDailyDays = dayRows.filter((d) => d.n >= 2).map((d) => labelDayShort(d.d));

  return {
    rows: Object.values(map),
    total_hours: round2(totalHours),
    sessions_count: sessionsCount,
    twice_daily_days_label: twiceDailyDays.length > 0 ? twiceDailyDays.join('/') : null,
  };
}

function mapCategoryToModality(category: string | null): ModalityKey | null {
  if (!category) return null;
  switch (category) {
    case 'cardio': return 'running';
    case 'strength': return 'strength';
    case 'hyrox_station': return 'hyrox';
    case 'skill': return 'skill';
    case 'mobility': return 'recovery';
    case 'plyometric': return 'skill';
    case 'core': return 'strength';
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Trends — 30d sparklines + zone-time
// ---------------------------------------------------------------------------

async function loadTrends(
  client: Sql,
  athlete_id: number,
  now: Date,
  tssSeries: ReadonlyArray<DailyTss>,
): Promise<TrendsBlock> {
  // CTL/ATL/TSB series — ONE engine (computeLoadSeries), warmed over the FULL
  // 90-day window and only then sliced to the plotted 30, exactly like the KPI
  // above it. The previous version re-implemented the EWMA by hand over the last
  // 30 days from a cold zero while claiming to "stay consistent with
  // summarizeLoad": on real data that put the chart's CTL at roughly a third of
  // the card's, so the number and the line under it disagreed on screen.
  // computeLoadSeries is 1:1 with its input, so slicing both the same way keeps
  // point and day aligned whatever the series length.
  const plottedLoad = computeLoadSeries(tssSeries).slice(-TRENDS_DAYS);
  const plottedDays = tssSeries.slice(-TRENDS_DAYS);
  const ctlAtl: CtlAtlPoint[] = plottedLoad.map((p, i) => {
    // A day where he trained but rated nothing contributes tss 0, so on the
    // curve alone it is indistinguishable from a rest day and the line sags as
    // if he had recovered. The hole is NOT interpolated away and NOT hidden —
    // it is carried per point so the chart can mark that day for what it is
    // (docs/CONTRATO-UI.md §7).
    const day = plottedDays[i];
    return {
      iso_date: p.date,
      ctl: round1(p.ctl),
      atl: round1(p.atl),
      tsb: round1(p.tsb),
      unknown_seconds: day?.unknown_seconds ?? 0,
      unknown_sessions: day?.unknown_sessions ?? 0,
    };
  });

  const hrv = await loadDailyMetric(client, athlete_id, 'hrv', now, TRENDS_DAYS);
  const hrvBaselineRows = await client<Array<{ v: number | null }>>`
    select avg(value_numeric)::float as v from biometric_streams
    where athlete_id = ${athlete_id} and metric_type = 'hrv'
      and recorded_at >= ${addDays(now, -60).toISOString()}::timestamptz
      and recorded_at <  ${addDays(now, -14).toISOString()}::timestamptz
  `;
  const hrvBaseline = hrvBaselineRows[0]?.v != null ? Math.round(hrvBaselineRows[0].v) : null;

  const sleepRaw = await loadDailyMetric(client, athlete_id, 'sleep_duration', now, TRENDS_DAYS);
  const sleep = sleepRaw.map((p) => ({
    iso_date: p.iso_date,
    value: p.value != null ? round1(p.value / 3600) : null,
  }));
  const sleepValid = sleep.filter((p) => p.value != null).map((p) => p.value as number);
  const sleepAvg = sleepValid.length > 0 ? round1(sleepValid.reduce((s, v) => s + v, 0) / sleepValid.length) : null;

  const compliance = await loadComplianceSeries(client, athlete_id, now);
  const compDone = compliance.filter((p) => p.state === 'completed').length;
  const compTotal = compliance.filter((p) => p.state !== 'rest' && p.state !== 'future').length;
  const compPct = compTotal > 0 ? Math.round((compDone / compTotal) * 100) : null;

  const zoneTime = await loadZoneTime(client, athlete_id, now);

  return {
    ctl_atl_tsb: ctlAtl,
    hrv,
    hrv_baseline_ms: hrvBaseline,
    sleep,
    sleep_avg_h: sleepAvg,
    compliance,
    compliance_pct: compPct,
    compliance_done: compDone,
    compliance_total: compTotal,
    zone_time: zoneTime,
  };
}

async function loadDailyMetric(
  client: Sql,
  athlete_id: number,
  metric: string,
  now: Date,
  days: number,
): Promise<SparkPoint[]> {
  const startIso = addDays(now, -(days - 1)).toISOString();
  const rows = await client<Array<{ d: string; v: number | null }>>`
    select to_char(date_trunc('day', recorded_at)::date, 'YYYY-MM-DD') as d,
           avg(value_numeric)::float as v
    from biometric_streams
    where athlete_id = ${athlete_id}
      and metric_type = ${metric}
      and recorded_at >= ${startIso}::timestamptz
    group by 1
    order by 1
  `;
  const byDate = new Map(rows.map((r) => [r.d, r.v]));
  const out: SparkPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(now, -i);
    const key = isoDate(day);
    const v = byDate.get(key) ?? null;
    out.push({ iso_date: key, value: v });
  }
  return out;
}

async function loadComplianceSeries(
  client: Sql,
  athlete_id: number,
  now: Date,
): Promise<CompliancePoint[]> {
  const startIso = isoDate(addDays(now, -(TRENDS_DAYS - 1)));
  const rows = await client<Array<{ d: string; status: string }>>`
    select to_char(scheduled_for, 'YYYY-MM-DD') as d, status::text as status
    from workout_assignments
    where athlete_id = ${athlete_id}
      and scheduled_for >= ${startIso}::date
      and scheduled_for <= ${isoDate(now)}::date
  `;
  const byDate = new Map<string, string>();
  for (const r of rows) byDate.set(r.d, r.status);
  const out: CompliancePoint[] = [];
  for (let i = TRENDS_DAYS - 1; i >= 0; i--) {
    const day = addDays(now, -i);
    const key = isoDate(day);
    const status = byDate.get(key);
    if (!status) {
      out.push({ iso_date: key, state: 'rest' });
    } else if (status === 'completed') {
      out.push({ iso_date: key, state: 'completed' });
    } else if (status === 'missed') {
      out.push({ iso_date: key, state: 'missed' });
    } else {
      out.push({ iso_date: key, state: 'future' });
    }
  }
  return out;
}

/**
 * Time in each HR zone over the last 7 days.
 *
 * The bands come from `loadAthleteHrZones` — the SAME five the athlete's phone
 * paints and the watch is alerted on. They used to be computed in the SQL as
 * percentages of a hardcoded 200 bpm, so every athlete was bucketed against a
 * maximum nobody had measured and few would have; a 44-year-old's easy run
 * landed in "Z2" on this screen and in "Z3" on his own phone.
 *
 * Null when the athlete has no anchor: they have no zones, so there is no time
 * in them. Classification happens in TypeScript rather than in the CASE so the
 * band edges cannot drift from the model.
 */
async function loadZoneTime(client: Sql, athlete_id: number, now: Date): Promise<ZoneTimeBlock | null> {
  const zones = await loadAthleteHrZones(athlete_id, client);
  if (!zones) return null;

  const rows = await client<Array<{ hr: number }>>`
    select value_numeric::float as hr
    from biometric_streams
    where athlete_id = ${athlete_id}
      and metric_type::text = 'hr'
      and recorded_at >= ${addDays(now, -7).toISOString()}::timestamptz
      and value_numeric is not null
  `;

  const counts = new Map<number, number>();
  let total = 0;
  for (const r of rows) {
    const z = zoneForBpm(r.hr, zones);
    if (z == null) continue;
    counts.set(z, (counts.get(z) ?? 0) + 1);
    total += 1;
  }

  const pct = (z: number) => (total > 0 ? Math.round(((counts.get(z) ?? 0) / total) * 100) : 0);
  return {
    pct: { z2: pct(2), z3: pct(3), z4: pct(4), z5: pct(5) },
    lthr_bpm: zones.lthr_bpm,
    estimated: zones.estimated,
    source_label: HR_ANCHOR_LABEL[zones.source],
  };
}

// ---------------------------------------------------------------------------
// Performance per exercise
// ---------------------------------------------------------------------------

async function loadPerformance(
  client: Sql,
  athlete_id: number,
  coach_id: bigint | number,
  now: Date,
): Promise<PerformanceBlock> {
  const since = addDays(now, -90).toISOString();
  const rows = await client<
    Array<{
      slug: string;
      name: string;
      category: string;
      hyrox_station_position: number | null;
      best_seconds: number | null;
      avg_seconds: number | null;
      attempts: number;
      stddev_seconds: number | null;
      last_done_at: Date | null;
    }>
  >`
    select
      e.slug                               as slug,
      -- Coach's renamed exercise wins over the base catalog name (mig 0132) —
      -- this is the per-exercise performance label the coach reads.
      coalesce(ceo.name, e.name)           as name,
      e.category::text                     as category,
      e.hyrox_station_position             as hyrox_station_position,
      min(extract(epoch from (se.ended_at - se.started_at)))::int as best_seconds,
      avg(extract(epoch from (se.ended_at - se.started_at)))::int as avg_seconds,
      count(se.id)::int                    as attempts,
      stddev_pop(extract(epoch from (se.ended_at - se.started_at)))::float as stddev_seconds,
      max(coalesce(we.ended_at, we.started_at, we.created_at)) as last_done_at
    from segment_executions se
    join template_segments ts on ts.id = se.template_segment_id
    join exercises e on e.id = ts.exercise_id
    ${joinCoachOverride(client, coach_id)}
    join workout_executions we on we.id = se.execution_id
    where we.athlete_id = ${athlete_id}
      and coalesce(we.ended_at, we.started_at, we.created_at) >= ${since}
      and se.started_at is not null and se.ended_at is not null
    group by e.slug, e.name, e.category, e.hyrox_station_position, ceo.name
    having count(se.id) >= 1
    order by e.category, coalesce(ceo.name, e.name)
  `;

  const benchmarks = await client<
    Array<{ slug: string; value: number; unit: string; recorded_at: Date }>
  >`
    select distinct on (ab.exercise_slug)
      ab.exercise_slug as slug, ab.value::float as value, ab.unit, ab.recorded_at
    from athlete_benchmarks ab
    where ab.athlete_id = ${athlete_id}
    order by ab.exercise_slug, ab.recorded_at desc
  `;

  const groups: Record<PerformanceGroup, PerformanceRow[]> = {
    running: [],
    hyrox_stations: [],
    strength: [],
  };

  for (const r of rows) {
    const group: PerformanceGroup | null =
      r.category === 'hyrox_station' ? 'hyrox_stations'
      : r.category === 'cardio' ? 'running'
      : r.category === 'strength' ? 'strength'
      : null;
    if (!group) continue;

    const cv = r.avg_seconds && r.avg_seconds > 0 && r.stddev_seconds != null
      ? r.stddev_seconds / r.avg_seconds
      : null;
    const variability: PerformanceRow['variability'] =
      cv == null ? null : cv < 0.05 ? 'low' : cv < 0.12 ? 'med' : 'high';

    groups[group].push({
      exercise_label: r.name,
      group,
      best_label: r.best_seconds != null ? formatTime(r.best_seconds) : null,
      avg_label: r.avg_seconds != null ? formatTime(r.avg_seconds) : null,
      trend: null,
      trend_pct: null,
      variability,
      last_done_label: relativeDayLabel(r.last_done_at, now),
      hint_text: cv != null && cv >= 0.12 ? 'CV alto' : null,
    });
  }

  for (const b of benchmarks) {
    groups.strength.push({
      exercise_label: prettifySlug(b.slug),
      group: 'strength',
      best_label: `${round1(b.value)} ${b.unit}`,
      avg_label: null,
      trend: null,
      trend_pct: null,
      variability: null,
      last_done_label: `tested ${relativeDayLabel(b.recorded_at, now) ?? ''}`.trim(),
      hint_text: null,
    });
  }

  return {
    groups: [
      { key: 'running',         label: 'Running',         rows: groups.running },
      { key: 'hyrox_stations',  label: 'HYROX stations',  rows: groups.hyrox_stations },
      { key: 'strength',        label: 'Strength',        rows: groups.strength },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recent workouts grouped by day with AM/PM markers
// ---------------------------------------------------------------------------

async function loadRecentDays(
  client: Sql,
  athlete_id: number,
  now: Date,
): Promise<RecentDay[]> {
  const sinceIso = addDays(now, -RECENT_DAYS).toISOString();
  const rows = await client<
    Array<{
      execution_id: string;
      ts: Date;
      title: string;
      duration_seconds: number | null;
      rpe: number | null;
      status: string;
      perceived_difficulty: 'too_easy' | 'as_expected' | 'too_hard' | null;
      pain_area: string | null;
      pain_note: string | null;
    }>
  >`
    select
      we.id::text as execution_id,
      coalesce(we.ended_at, we.started_at, we.created_at) as ts,
      coalesce(t.name, 'Sesión') as title,
      we.total_duration_seconds as duration_seconds,
      we.perceived_exertion::float as rpe,
      coalesce(wa.status, 'completed')::text as status,
      we.perceived_difficulty as perceived_difficulty,
      we.pain_area as pain_area,
      we.pain_note as pain_note
    from workout_executions we
    left join workout_assignments wa on wa.id = we.assignment_id
    left join templates t on t.id = wa.template_id
    where we.athlete_id = ${athlete_id}
      and coalesce(we.ended_at, we.started_at, we.created_at) >= ${sinceIso}
    order by ts desc
    limit 24
  `;

  const byDay = new Map<string, RecentSession[]>();
  for (const r of rows) {
    const dayKey = isoDate(new Date(r.ts));
    const slot = slotFromTimestamp(r.ts);
    const arr = byDay.get(dayKey) ?? [];
    arr.push({
      slot,
      title: r.title,
      duration_seconds: r.duration_seconds ?? null,
      rpe: r.rpe ?? null,
      status: (r.status as RecentSession['status']) ?? 'completed',
      is_pr: false,
      perceived_difficulty: r.perceived_difficulty,
      pain_area: r.pain_area,
      pain_note: r.pain_note,
    });
    byDay.set(dayKey, arr);
  }

  const out: RecentDay[] = [];
  for (let i = 0; i < RECENT_DAYS; i++) {
    const day = addDays(now, -i);
    const key = isoDate(day);
    const sessions = byDay.get(key) ?? [];
    if (sessions.length === 1) sessions[0].slot = 'SOLO';
    out.push({
      iso_date: key,
      label: relativeDayLabel(day, now) ?? labelDayShort(key),
      sessions: sessions.sort((a, b) => slotOrder(a.slot) - slotOrder(b.slot)),
    });
  }
  return out;
}

function slotOrder(slot: RecentSession['slot']): number {
  return slot === 'AM' ? 0 : slot === 'PM' ? 1 : 2;
}

function slotFromTimestamp(ts: Date): RecentSession['slot'] {
  const hour = ts.getUTCHours();
  if (hour < 12) return 'AM';
  return 'PM';
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

async function loadNotes(
  client: Sql,
  athlete_id: number,
  coach_id: bigint | number,
): Promise<CoachNote[]> {
  const rows = await client<Array<{ id: string; body: string; created_at: Date }>>`
    select id::text, body, created_at
    from athlete_coach_notes
    where athlete_id = ${athlete_id}
      and coach_id = ${coach_id as number}
      and deleted_at is null
    order by created_at desc
    limit 50
  `;
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    created_at_iso: r.created_at.toISOString(),
    date_label: formatNoteDate(r.created_at),
  }));
}

export async function appendNote(params: {
  athlete_id: string;
  coach_id: bigint | number;
  body: string;
  client?: Sql;
}): Promise<CoachNote> {
  const client = params.client ?? defaultSql;
  const numericId = Number(params.athlete_id);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw new AthleteDeepDiveError('not_found', `athlete ${params.athlete_id} not found`);
  }
  // Verify the coach owns this athlete.
  const owns = await client<Array<{ n: number }>>`
    select count(*)::int as n from athletes
    where id = ${numericId} and coach_id = ${params.coach_id as number}
  `;
  if ((owns[0]?.n ?? 0) === 0) {
    throw new AthleteDeepDiveError('forbidden', 'athlete not assigned to coach');
  }

  const inserted = await client<Array<{ id: string; body: string; created_at: Date }>>`
    insert into athlete_coach_notes (athlete_id, coach_id, body)
    values (${numericId}, ${params.coach_id as number}, ${params.body})
    returning id::text, body, created_at
  `;
  const r = inserted[0];
  return {
    id: r.id,
    body: r.body,
    created_at_iso: r.created_at.toISOString(),
    date_label: formatNoteDate(r.created_at),
  };
}

// ---------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------

// The numbers are always shown: they are the real load of the sessions we could
// price, and under a hole CTL/ATL are a floor. What does NOT survive is the
// VERDICT — "fresco / cargado", "ACR alto / bajo" — because a hole moves TSB and
// ACR in a direction nobody can determine (shared/domain/training-load/
// coverage.ts). Same law that took the barra y el veredicto off a station
// comparison with no range: número sí, sentencia no.
function buildCarga(input: {
  ctl: number; atl: number; tsb: number; acr: number; z34_pct_7d: number | null;
  coverage: LoadCoverage;
}): KpiCarga {
  const verdict = input.coverage.allows_verdict;
  return {
    ctl: round1(input.ctl), ctl_trend: 'flat',
    atl: round1(input.atl), atl_trend: 'flat',
    tsb: round1(input.tsb), tsb_label: verdict ? tsbLabel(input.tsb) : null,
    acr: round2(input.acr), acr_label: verdict ? acrLabel(input.acr) : null,
    z34_pct_7d: input.z34_pct_7d,
    polarization_pct: null,
    polarization_warn: false,
    coverage: input.coverage,
  };
}

function tsbLabel(tsb: number): string {
  if (tsb >= 5) return 'fresco';
  if (tsb <= -10) return 'cargado';
  return 'neutral';
}
function acrLabel(acr: number): string {
  if (acr < 0.8) return 'bajo';
  if (acr > 1.3) return 'alto';
  return 'normal';
}

// ---------------------------------------------------------------------------
// Alerts + banner
// ---------------------------------------------------------------------------

function computeAlerts(input: {
  hrv_delta_ms: number | null;
  sleep_avg_h: number | null;
  rpe_recent: number[];
  a_event_days: number | null;
}): AlertReason[] {
  const out: AlertReason[] = [];
  if (input.hrv_delta_ms != null && input.hrv_delta_ms <= -10) {
    out.push({
      kind: 'hrv_crash', severity: 'critical',
      label: 'HRV crash',
      detail: `▼ ${Math.abs(input.hrv_delta_ms)} ms vs baseline`,
    });
  }
  const maxRpe = Math.max(0, ...input.rpe_recent);
  if (maxRpe >= 9) {
    out.push({
      kind: 'rpe_high', severity: 'warning',
      label: `RPE ${round1(maxRpe)} reciente`, detail: 'monitor sobreesfuerzo',
    });
  }
  if (input.sleep_avg_h != null && input.sleep_avg_h < 6) {
    out.push({
      kind: 'rpe_high', severity: 'warning',
      label: `Sueño ${round1(input.sleep_avg_h)}h`, detail: '<6h media 7d',
    });
  }
  return out;
}

function computeBanner(input: {
  alerts: AlertReason[];
  aEvent: AEvent | null;
  hasMacrocycle: boolean;
}): DeepDiveBanner | null {
  if (!input.hasMacrocycle) {
    return {
      kind: 'macrocycle_missing', severity: 'warning',
      title: 'Macrociclo sin configurar',
      detail: 'Sin plan asignado — auto-asignaciones bloqueadas',
      cta_label: 'Configurar macrociclo',
    };
  }
  if (input.aEvent && input.aEvent.days_until < 0) {
    return {
      kind: 'a_event_passed', severity: 'info',
      title: `A-event completado · ${input.aEvent.iso_date}`,
      detail: 'Elegir siguiente A-event para iniciar nuevo macrociclo',
      cta_label: 'Elegir A-event',
    };
  }
  const critical = input.alerts.find((a) => a.severity === 'critical');
  if (critical) {
    return {
      kind: 'alert', severity: 'critical',
      title: critical.label, detail: critical.detail, cta_label: 'Ver detalle',
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

function ageFromDob(dob: Date | null): number | null {
  if (!dob) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

function trimNumStr(s: string): string {
  // "5.0" → "5" but "5.5" stays
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return Number.isInteger(n) ? `${n}` : `${round1(n)}`;
}

function relativeDayLabel(d: Date | null, now: Date): string | null {
  if (!d) return null;
  const days = daysBetween(d, now);
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 0) return null;
  if (days <= 14) return `−${days}d`;
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

function labelDayShort(iso: string): string {
  return parseIso(iso).toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function formatNoteDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function prettifySlug(slug: string): string {
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}
function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map((s) => Number(s));
  return new Date(Date.UTC(y, m - 1, d));
}
function daysBetween(a: Date, b: Date): number {
  const aDay = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bDay = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((bDay - aDay) / 86_400_000);
}
function round1(n: number): number { return Math.round(n * 10) / 10; }
function round2(n: number): number { return Math.round(n * 100) / 100; }
