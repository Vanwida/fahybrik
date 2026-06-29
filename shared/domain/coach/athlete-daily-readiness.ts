import type { Sql } from 'postgres';
import { addDays, isoDateString, parseIsoDate, startOfDayInBox } from '../dates';

export type ReadinessBreakdown = {
  sub_score: number | null;
  sub_score_weight: number;
  hrv_component: number | null;
  sleep_hours: number | null;
  sleep_component: number | null;
  rhr_component: number | null;
  recovery_component: number | null;
};

export type DailyReadinessSnapshot = {
  athlete_id: string;
  recorded_for: string;
  score: number;
  breakdown: ReadinessBreakdown;
  delta_7d: number | null;
};

const WEIGHTS = {
  sub_score: 0.35,
  hrv: 0.25,
  sleep: 0.2,
  rhr: 0.1,
  recovery: 0.1,
} as const;

export async function computeAthleteDailyReadiness(params: {
  athlete_id: number | bigint;
  recorded_for: string;
  client: Sql;
}): Promise<DailyReadinessSnapshot | null> {
  const client = params.client;
  const day = parseIsoDate(params.recorded_for);
  const weekAgoIso = isoDateString(addDays(day, -7));

  const checkin = await client<Array<{ sub_score: number }>>`
    select sub_score from daily_checkins
    where athlete_id = ${params.athlete_id as number}
      and recorded_for = ${params.recorded_for}::date
    limit 1
  `;
  let subScore = checkin[0]?.sub_score ?? null;
  if (subScore == null) {
    const last = await client<Array<{ sub_score: number }>>`
      select sub_score from daily_checkins
      where athlete_id = ${params.athlete_id as number}
        and recorded_for < ${params.recorded_for}::date
      order by recorded_for desc limit 1
    `;
    subScore = last[0]?.sub_score ?? null;
  }

  const bio = await client<
    Array<{ hrv_recent: number | null; hrv_base: number | null; sleep_h: number | null; rhr: number | null; recovery: number | null }>
  >`
    select
      (select avg(value_numeric)::float from biometric_streams
        where athlete_id = ${params.athlete_id as number} and metric_type = 'hrv'
          and recorded_at::date = ${params.recorded_for}::date) as hrv_recent,
      (select avg(value_numeric)::float from biometric_streams
        where athlete_id = ${params.athlete_id as number} and metric_type = 'hrv'
          and recorded_at >= ${params.recorded_for}::date - interval '60 days'
          and recorded_at < ${params.recorded_for}::date - interval '14 days') as hrv_base,
      (select avg(value_numeric)::float / 3600.0 from biometric_streams
        where athlete_id = ${params.athlete_id as number} and metric_type = 'sleep_duration'
          and recorded_at::date = ${params.recorded_for}::date) as sleep_h,
      (select avg(value_numeric)::float from biometric_streams
        where athlete_id = ${params.athlete_id as number} and metric_type = 'hr_resting'
          and recorded_at::date = ${params.recorded_for}::date) as rhr,
      (select avg(value_numeric)::float from biometric_streams
        where athlete_id = ${params.athlete_id as number} and metric_type = 'recovery_score'
          and recorded_at::date = ${params.recorded_for}::date) as recovery
  `;
  const b = bio[0];

  const complianceRows = await client<Array<{ scheduled: number; completed: number }>>`
    select
      count(*)::int as scheduled,
      count(*) filter (where status = 'completed')::int as completed
    from workout_assignments
    where athlete_id = ${params.athlete_id as number}
      and scheduled_for >= ${weekAgoIso}::date
      and scheduled_for <= ${params.recorded_for}::date
  `;
  const compliance =
    complianceRows[0] && complianceRows[0].scheduled > 0
      ? complianceRows[0].completed / complianceRows[0].scheduled
      : null;

  const hrvComponent =
    b?.hrv_recent != null && b?.hrv_base != null && b.hrv_base > 0
      ? clampScore(50 + ((b.hrv_recent - b.hrv_base) / b.hrv_base) * 100)
      : null;

  const sleepComponent =
    b?.sleep_h != null ? clampScore(Math.min(100, (b.sleep_h / 8) * 100)) : null;

  const rhrComponent = b?.rhr != null ? clampScore(100 - Math.max(0, b.rhr - 50) * 2) : null;

  const recoveryComponent =
    b?.recovery != null ? clampScore(b.recovery) : null;

  const breakdown: ReadinessBreakdown = {
    sub_score: subScore,
    sub_score_weight: WEIGHTS.sub_score,
    hrv_component: hrvComponent,
    sleep_hours: b?.sleep_h ?? null,
    sleep_component: sleepComponent,
    rhr_component: rhrComponent,
    recovery_component: recoveryComponent,
  };
  // NOTE: `compliance` is still computed below as a SCORE MODIFIER, but it's no
  // longer carried in the breakdown DTO — adherence-over-7d is a progression
  // concept, not a "how you arrive today" readiness contributor, and no surface
  // renders it as a chip.

  const parts: Array<{ w: number; v: number }> = [];
  if (subScore != null) parts.push({ w: WEIGHTS.sub_score, v: subScore });
  if (hrvComponent != null) parts.push({ w: WEIGHTS.hrv, v: hrvComponent });
  if (sleepComponent != null) parts.push({ w: WEIGHTS.sleep, v: sleepComponent });
  if (rhrComponent != null) parts.push({ w: WEIGHTS.rhr, v: rhrComponent });
  if (recoveryComponent != null) parts.push({ w: WEIGHTS.recovery, v: recoveryComponent });

  // Zero real signals (no check-in ever recorded AND no wearable component) →
  // there is nothing to score. We must NOT invent a 50 and persist it: a
  // fabricated number reads as a real readiness on Today and suppresses the
  // honest "Sin datos · haz tu check-in" empty state. Return null so the UI
  // renders the empty state instead. (`compliance` is a modifier, not a
  // signal, so it is intentionally excluded from this check.)
  const totalW = parts.reduce((s, p) => s + p.w, 0);
  if (totalW === 0) return null;

  let score = Math.round(parts.reduce((s, p) => s + p.v * (p.w / totalW), 0));
  if (compliance != null && compliance < 0.6) score = Math.min(score, score - 5);
  score = clampScore(score);

  const prevRows = await client<Array<{ score: number }>>`
    select score from athlete_daily_readiness_snapshots
    where athlete_id = ${params.athlete_id as number}
      and recorded_for = ${weekAgoIso}::date
    limit 1
  `;
  const delta7d = prevRows[0] ? score - prevRows[0].score : null;

  await client`
    insert into athlete_daily_readiness_snapshots (athlete_id, recorded_for, score, breakdown_json)
    values (
      ${params.athlete_id as number},
      ${params.recorded_for}::date,
      ${score},
      ${JSON.stringify(breakdown)}::jsonb
    )
    on conflict (athlete_id, recorded_for) do update set
      score = excluded.score,
      breakdown_json = excluded.breakdown_json,
      computed_at = now()
  `;

  return {
    athlete_id: String(params.athlete_id),
    recorded_for: params.recorded_for,
    score,
    breakdown,
    delta_7d: delta7d,
  };
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export async function getLatestReadiness(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client: Sql;
}): Promise<DailyReadinessSnapshot | null> {
  const client = params.client;
  const iso = isoDateString(startOfDayInBox(params.on_date ?? new Date()));
  const rows = await client<Array<{ recorded_for: string; score: number; breakdown_json: unknown }>>`
    select
      to_char(recorded_for, 'YYYY-MM-DD') as recorded_for,
      score,
      breakdown_json
    from athlete_daily_readiness_snapshots
    where athlete_id = ${params.athlete_id as number}
      and recorded_for <= ${iso}::date
    order by recorded_for desc
    limit 1
  `;
  const row = rows[0];
  if (!row) {
    try {
      return await computeAthleteDailyReadiness({
        athlete_id: params.athlete_id,
        recorded_for: iso,
        client,
      });
    } catch {
      return null;
    }
  }
  return {
    athlete_id: String(params.athlete_id),
    recorded_for: row.recorded_for,
    score: row.score,
    breakdown: row.breakdown_json as ReadinessBreakdown,
    delta_7d: null,
  };
}
