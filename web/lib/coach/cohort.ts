// Cohort row builder. Reads athletes assigned to the current coach and rolls up
// per-athlete metrics for the dashboard. Falls back to a demo cohort when the
// real data set is below the demo-quality threshold (Pablo's onboarding state).

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { getCurrentMicrociclo } from '@fahybrid/shared/domain/coach/current-microciclo';
import { assessAthleteProgressReadiness } from '@fahybrid/shared/domain/coach/progress-readiness';
import { getDailyTssSeries, summarizeLoad } from '@/lib/training-load';
import { buildDemoCohort } from './demo-data';
import { getAthleteProgrammingStatus } from './programming-status';
import { getLatestReadiness } from './athlete-daily-readiness';
import { SIGNAL_THRESHOLDS } from './signal-config';
import type { AlertReason, CohortRow } from '@fahybrid/shared/domain/coach/types';

const DEMO_THRESHOLD = 3;

export interface BuildCohortParams {
  coach_id: bigint | number;
  now?: Date;
  client?: Sql;
}

interface AthleteRow {
  athlete_id: string;
  full_name: string;
  next_session_iso: string | null;
  last_sync_at: Date | null;
  hrv_recent: number | null;
  hrv_baseline: number | null;
  rhr: number | null;
  sleep_avg_7d_h: number | null;
  vo2max: number | null;
  last_checkin_at: Date | null;
  rpe_yesterday: number | null;
  unread_message_age_min: number | null;
  missed_sessions_7d: number;
  scheduled_today: number;
  scheduled_today_done: number;
  a_event_iso: string | null;
}

export async function buildCohort(params: BuildCohortParams): Promise<CohortRow[]> {
  const client = params.client ?? defaultSql;
  const now = params.now ?? new Date();

  const realRows = await loadRealCohort(client, params.coach_id, now);
  if (realRows.length >= DEMO_THRESHOLD) {
    return realRows;
  }

  // Demo augmentation — show 13 personas plus any real athletes (real first).
  const demo = buildDemoCohort({ now });
  return [...realRows, ...demo].slice(0, Math.max(13, realRows.length));
}

async function loadRealCohort(
  client: Sql,
  coach_id: bigint | number,
  now: Date,
): Promise<CohortRow[]> {
  const todayIso = now.toISOString().slice(0, 10);

  const athletes = await client<AthleteRow[]>`
    with hrv_recent as (
      select bs.athlete_id, avg(bs.value_numeric)::float as v
      from biometric_streams bs
      where bs.metric_type = 'hrv'
        and bs.recorded_at >= ${now.toISOString()}::timestamptz - interval '7 days'
      group by bs.athlete_id
    ),
    hrv_baseline as (
      select bs.athlete_id, avg(bs.value_numeric)::float as v
      from biometric_streams bs
      where bs.metric_type = 'hrv'
        and bs.recorded_at >= ${now.toISOString()}::timestamptz - interval '60 days'
        and bs.recorded_at <  ${now.toISOString()}::timestamptz - interval '14 days'
      group by bs.athlete_id
    ),
    rhr_latest as (
      select distinct on (bs.athlete_id) bs.athlete_id, bs.value_numeric::float as v
      from biometric_streams bs
      where bs.metric_type = 'hr_resting'
      order by bs.athlete_id, bs.recorded_at desc
    ),
    sleep_7d as (
      select bs.athlete_id, avg(bs.value_numeric)::float / 3600.0 as v
      from biometric_streams bs
      where bs.metric_type = 'sleep_duration'
        and bs.recorded_at >= ${now.toISOString()}::timestamptz - interval '7 days'
      group by bs.athlete_id
    ),
    vo2_latest as (
      select distinct on (bs.athlete_id) bs.athlete_id, bs.value_numeric::float as v
      from biometric_streams bs
      where bs.metric_type = 'vo2max'
      order by bs.athlete_id, bs.recorded_at desc
    ),
    last_sync as (
      select bs.athlete_id, max(bs.recorded_at) as ts
      from biometric_streams bs
      group by bs.athlete_id
    ),
    next_session as (
      select distinct on (wa.athlete_id)
        wa.athlete_id,
        to_char(wa.scheduled_for, 'YYYY-MM-DD') as iso
      from workout_assignments wa
      where wa.scheduled_for >= ${todayIso}::date
        and wa.status = 'scheduled'
      order by wa.athlete_id, wa.scheduled_for asc, wa.id asc
    ),
    today_sessions as (
      select wa.athlete_id,
             count(*)::int as scheduled,
             count(*) filter (where wa.status = 'completed')::int as done
      from workout_assignments wa
      where wa.scheduled_for = ${todayIso}::date
      group by wa.athlete_id
    ),
    missed_7d as (
      select wa.athlete_id, count(*)::int as n
      from workout_assignments wa
      where wa.status = 'missed'
        and wa.scheduled_for >= ${todayIso}::date - interval '7 days'
        and wa.scheduled_for <= ${todayIso}::date
      group by wa.athlete_id
    ),
    rpe_yest as (
      select we.athlete_id, max(we.perceived_exertion)::float as v
      from workout_executions we
      where coalesce(we.ended_at, we.started_at, we.created_at)
              >= ${todayIso}::date - interval '1 day'
        and coalesce(we.ended_at, we.started_at, we.created_at)
              <  ${todayIso}::date
      group by we.athlete_id
    ),
    last_checkin as (
      select dc.athlete_id,
             max(dc.recorded_at) as ts
      from daily_checkins dc
      group by dc.athlete_id
    ),
    a_events as (
      select distinct on (ate.athlete_id)
        ate.athlete_id,
        to_char(e.start_date, 'YYYY-MM-DD') as iso
      from athlete_target_events ate
      join events e on e.id = ate.event_id
      where ate.priority = 'A'
        and e.start_date >= ${todayIso}::date
      order by ate.athlete_id, e.start_date asc
    ),
    unread_msgs as (
      select ct.athlete_id,
             extract(epoch from (now() - min(cm.created_at))) / 60 as age_min
      from chat_threads ct
      join chat_messages cm on cm.thread_id = ct.id
      where cm.read_at is null
        and cm.deleted_at is null
        and cm.sender_user_id <> (select user_id from coaches where id = ct.coach_id)
      group by ct.athlete_id
    )
    select
      a.id::text                    as athlete_id,
      a.full_name                   as full_name,
      ns.iso                        as next_session_iso,
      ls.ts                         as last_sync_at,
      hr.v                          as hrv_recent,
      hb.v                          as hrv_baseline,
      rl.v                          as rhr,
      sl.v                          as sleep_avg_7d_h,
      vo.v                          as vo2max,
      lc.ts                         as last_checkin_at,
      ry.v                          as rpe_yesterday,
      um.age_min                    as unread_message_age_min,
      coalesce(m7.n, 0)             as missed_sessions_7d,
      coalesce(ts.scheduled, 0)     as scheduled_today,
      coalesce(ts.done, 0)          as scheduled_today_done,
      ae.iso                        as a_event_iso
    from athletes a
    left join hrv_recent  hr on hr.athlete_id = a.id
    left join hrv_baseline hb on hb.athlete_id = a.id
    left join rhr_latest  rl on rl.athlete_id = a.id
    left join sleep_7d    sl on sl.athlete_id = a.id
    left join vo2_latest  vo on vo.athlete_id = a.id
    left join last_sync   ls on ls.athlete_id = a.id
    left join next_session ns on ns.athlete_id = a.id
    left join today_sessions ts on ts.athlete_id = a.id
    left join missed_7d   m7 on m7.athlete_id = a.id
    left join rpe_yest    ry on ry.athlete_id = a.id
    left join last_checkin lc on lc.athlete_id = a.id
    left join a_events    ae on ae.athlete_id = a.id
    left join unread_msgs um on um.athlete_id = a.id
    where a.coach_id = ${coach_id as number}
    order by a.full_name asc
  `;

  const rows: CohortRow[] = [];
  for (const a of athletes) {
    rows.push(await rollupAthlete(a, client, now));
  }
  return rows;
}

async function rollupAthlete(
  a: AthleteRow,
  client: Sql,
  now: Date,
): Promise<CohortRow> {
  const athlete_id_num = Number(a.athlete_id);

  const micro = await getCurrentMicrociclo({
    athlete_id: athlete_id_num,
    on_date: now,
    client,
  });

  const series = await getDailyTssSeries({
    athlete_id: athlete_id_num,
    end_date: now,
    days: 90,
    client,
  });
  const load = summarizeLoad(series);

  const last7 = series.slice(-7);
  const volume_7d_h = round1(last7.reduce((s, p) => s + (p.tss > 0 ? p.tss / 60 : 0), 0));
  const sessions_7d_count = last7.filter((p) => p.tss > 0).length;
  const compliance_pct = await computeCompliance(client, athlete_id_num, now);

  const last_sync_at = a.last_sync_at?.toISOString() ?? null;
  const sync_minutes_ago =
    a.last_sync_at == null ? null : Math.floor((now.getTime() - a.last_sync_at.getTime()) / 60_000);

  const hrv_delta_ms =
    a.hrv_recent != null && a.hrv_baseline != null
      ? round1(a.hrv_recent - a.hrv_baseline)
      : null;
  const hrv_trend = hrvTrend(hrv_delta_ms);

  const a_event_iso = a.a_event_iso ?? null;
  const days_to_a_event = a_event_iso ? daysBetween(now, parseIso(a_event_iso)) : null;

  const alerts = computeAlerts({
    hrv_delta_ms,
    sync_minutes_ago,
    missed_sessions_7d: a.missed_sessions_7d,
    rpe_yesterday: a.rpe_yesterday,
    unread_message_age_min: a.unread_message_age_min,
    last_checkin_at: a.last_checkin_at,
    now,
  });

  const sessions_today: CohortRow['sessions_today'] = sessionsTodayLabel(
    a.scheduled_today,
    a.scheduled_today_done,
  );

  const next_session: CohortRow['next_session'] =
    a.next_session_iso == null
      ? null
      : { label: nextSessionLabel(a.next_session_iso, now), iso_date: a.next_session_iso };

  const flags = {
    transition_ready: false,
    test_today: false,
    twice_daily_today: a.scheduled_today >= 2,
    a_event_within_30d:
      days_to_a_event != null && days_to_a_event <= SIGNAL_THRESHOLDS.a_event_near_days,
  };

  const [programming, readiness, progress] = await Promise.all([
    getAthleteProgrammingStatus({ athlete_id: athlete_id_num, on_date: now, client }),
    getLatestReadiness({ athlete_id: athlete_id_num, on_date: now, client }),
    assessAthleteProgressReadiness({ athlete_id: athlete_id_num, on_date: now, client }),
  ]);

  if (progress?.recommendation === 'advance') {
    flags.transition_ready = true;
    alerts.unshift({
      kind: 'transition_ready',
      severity: 'warning',
      label: 'Listo para progresar',
      detail: progress.reasons.join(' · ') || 'Revisar deep-dive',
    });
  }

  if (programming.status !== 'ok') {
    alerts.unshift({
      kind: 'block_phase',
      severity: programming.status === 'month_2_pending' ? 'critical' : 'warning',
      label: programming.label,
      detail: programming.detail ?? '',
    });
  }

  return {
    athlete_id: a.athlete_id,
    full_name: a.full_name,
    is_demo: false,
    block_type: micro?.name ?? null,
    block_week: micro?.week_index ?? null,
    compliance_pct,
    hrv_delta_ms,
    hrv_trend,
    acr: round2(load.acr),
    tsb: round1(load.tsb),
    ctl: round1(load.ctl),
    atl: round1(load.atl),
    next_session,
    last_sync_at,
    sync_minutes_ago,
    race_readiness: estimateRaceReadiness(load.tsb, compliance_pct, hrv_delta_ms, sessions_7d_count),
    polarization_pct: null,
    z45_pct_7d: null,
    vo2max: a.vo2max ?? null,
    vo2max_trend: null,
    sleep_avg_7d_h: a.sleep_avg_7d_h != null ? round1(a.sleep_avg_7d_h) : null,
    rhr: a.rhr != null ? Math.round(a.rhr) : null,
    days_to_a_event,
    volume_7d_h,
    sessions_today,
    last_checkin_at: a.last_checkin_at?.toISOString() ?? null,
    in_gym_today: a.scheduled_today > 0,
    alerts,
    primary_alert: alerts[0] ?? null,
    flags,
    programming_status: programming.status,
    programming_label: programming.status !== 'ok' ? programming.label : null,
    readiness_score: readiness?.score ?? null,
  };
}

async function computeCompliance(
  client: Sql,
  athlete_id: number,
  now: Date,
): Promise<number | null> {
  const startIso = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const todayIso = now.toISOString().slice(0, 10);
  const rows = await client<Array<{ scheduled: number; completed: number }>>`
    select
      count(*) filter (where wa.scheduled_for <= ${todayIso}::date)::int as scheduled,
      count(*) filter (
        where wa.scheduled_for <= ${todayIso}::date and wa.status = 'completed'
      )::int as completed
    from workout_assignments wa
    where wa.athlete_id = ${athlete_id}
      and wa.scheduled_for >= ${startIso}::date
  `;
  const r = rows[0];
  if (!r || r.scheduled === 0) return null;
  return Math.round((r.completed / r.scheduled) * 100);
}

function hrvTrend(delta: number | null): 'up' | 'down' | 'flat' | null {
  if (delta == null) return null;
  if (delta >= 2) return 'up';
  if (delta <= -2) return 'down';
  return 'flat';
}

function sessionsTodayLabel(
  scheduled: number,
  done: number,
): CohortRow['sessions_today'] {
  if (scheduled === 0) return { am: null, pm: null };
  if (scheduled === 1) {
    return { am: done >= 1 ? 'done' : 'pending', pm: null };
  }
  return {
    am: done >= 1 ? 'done' : 'pending',
    pm: done >= 2 ? 'done' : 'pending',
  };
}

function nextSessionLabel(iso: string, now: Date): string {
  const target = parseIso(iso);
  const diff = daysBetween(now, target);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  return target.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

function computeAlerts(params: {
  hrv_delta_ms: number | null;
  sync_minutes_ago: number | null;
  missed_sessions_7d: number;
  rpe_yesterday: number | null;
  unread_message_age_min: number | null;
  last_checkin_at: Date | null;
  now: Date;
}): AlertReason[] {
  const out: AlertReason[] = [];

  if (
    params.hrv_delta_ms != null &&
    params.hrv_delta_ms <= SIGNAL_THRESHOLDS.hrv_crash_delta_ms
  ) {
    out.push({
      kind: 'hrv_crash',
      severity: 'critical',
      label: 'HRV crash',
      detail: `▼ ${Math.abs(params.hrv_delta_ms).toFixed(0)} ms vs baseline`,
    });
  }
  if (
    params.sync_minutes_ago != null &&
    params.sync_minutes_ago > SIGNAL_THRESHOLDS.no_sync_critical_hours * 60
  ) {
    out.push({
      kind: 'no_sync',
      severity: 'critical',
      label: `${Math.floor(params.sync_minutes_ago / 60 / 24)}d sin sync`,
      detail: 'wearable offline',
    });
  } else if (
    params.sync_minutes_ago != null &&
    params.sync_minutes_ago > SIGNAL_THRESHOLDS.no_sync_warning_hours * 60
  ) {
    out.push({
      kind: 'no_sync',
      severity: 'warning',
      label: `Sync >${SIGNAL_THRESHOLDS.no_sync_warning_hours}h`,
      detail: 'comprobar wearable',
    });
  }
  if (params.missed_sessions_7d >= SIGNAL_THRESHOLDS.missed_sessions_min) {
    out.push({
      kind: 'missed_sessions',
      severity: 'warning',
      label: `${params.missed_sessions_7d} sesiones perdidas`,
      detail: 'última 7 días',
    });
  }
  if (params.rpe_yesterday != null && params.rpe_yesterday >= SIGNAL_THRESHOLDS.rpe_high_min) {
    out.push({
      kind: 'rpe_high',
      severity: 'warning',
      label: `RPE ${params.rpe_yesterday.toFixed(1)} ayer`,
      detail: 'monitor sobreesfuerzo',
    });
  }
  if (
    params.unread_message_age_min != null &&
    params.unread_message_age_min > SIGNAL_THRESHOLDS.message_unanswered_hours * 60
  ) {
    out.push({
      kind: 'message_unanswered',
      severity: 'warning',
      label: `Mensaje ${Math.floor(params.unread_message_age_min / 60)}h sin responder`,
      detail: 'inbox',
    });
  }
  const checkinAgeH =
    params.last_checkin_at == null
      ? Number.POSITIVE_INFINITY
      : (params.now.getTime() - params.last_checkin_at.getTime()) / 3_600_000;
  if (checkinAgeH > SIGNAL_THRESHOLDS.checkin_skipped_hours) {
    out.push({
      kind: 'checkin_skipped',
      severity: 'warning',
      label: 'Check-in 2d',
      detail: 'sin daily',
    });
  }
  return out;
}

function estimateRaceReadiness(
  tsb: number,
  compliance: number | null,
  hrv_delta: number | null,
  sessions_7d: number,
): number {
  // Rough composite — coach-grade rather than research-grade. Fitness band (-10..+10)
  // contributes 40, compliance 30, HRV 20, sessions completed 10.
  const tsbBand = Math.max(0, Math.min(40, ((tsb + 10) / 20) * 40));
  const compBand = compliance != null ? (compliance / 100) * 30 : 20;
  const hrvBand = hrv_delta == null ? 10 : Math.max(0, Math.min(20, 10 + hrv_delta));
  const sesBand = Math.min(10, sessions_7d * 1.5);
  return Math.round(tsbBand + compBand + hrvBand + sesBand);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
