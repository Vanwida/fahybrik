// Daily check-in ingestion + adaptive override evaluation.
//
// Spec: docs/ux/07-daily-morning-checkin.md.
//
// Persists into daily_checkins and runs the adaptive override rule:
//   sub_score < 40 AND today's planned RPE >= 8 AND HRV trend down
//   → flag adaptive_flag='consider_swap_z2_30' and notify Pablo.
//
// Two-day-skip alert (separate from this fn): handled by an off-hours job
// that scans for athletes who haven't filed a daily_checkin row in the last
// 48h (see lib/notifications/triggers.ts:checkSkippedCheckins).

import type { Sql } from '@/lib/db';
import type { CheckinSnapshot } from './schema';
import { notifyCoach } from '@/lib/notifications/dispatch';

export type CheckinIngestResult = {
  checkin_id: string;
  recorded_for: string;
  adaptive_flag: string | null;
  hrv_trend_down: boolean;
  planned_rpe_high: boolean;
};

export async function ingestCheckin(args: {
  sql: Sql;
  athlete_id: bigint;
  snapshot: CheckinSnapshot;
}): Promise<CheckinIngestResult> {
  const { sql, athlete_id, snapshot } = args;
  const recorded_for = snapshot.recorded_at.slice(0, 10);

  const adaptive = await evaluateAdaptive({ sql, athlete_id, snapshot, recorded_for });

  const rows = await sql<{ id: string }[]>`
    insert into daily_checkins (
      athlete_id, recorded_for, recorded_at, soreness, mood, motivation,
      fatigue, sleep_quality, notes, sub_score, adaptive_flag
    ) values (
      ${athlete_id as unknown as number},
      ${recorded_for}::date,
      ${snapshot.recorded_at},
      ${snapshot.soreness},
      ${snapshot.mood},
      ${snapshot.motivation},
      ${snapshot.fatigue},
      ${snapshot.sleep_quality},
      ${snapshot.notes ?? null},
      ${snapshot.sub_score},
      ${adaptive.flag}
    )
    on conflict (athlete_id, recorded_for) do update
      set recorded_at   = excluded.recorded_at,
          soreness      = excluded.soreness,
          mood          = excluded.mood,
          motivation    = excluded.motivation,
          fatigue       = excluded.fatigue,
          sleep_quality = excluded.sleep_quality,
          notes         = excluded.notes,
          sub_score     = excluded.sub_score,
          adaptive_flag = excluded.adaptive_flag,
          updated_at    = now()
    returning id::text
  `;

  if (adaptive.flag) {
    // Fire-and-forget Pablo notification. Failures here must not break the
    // ingest path — the check-in is the source of truth, the alert is a
    // courtesy.
    notifyCoach({
      sql,
      athlete_id,
      type: 'recovery_alert',
      payload: {
        kind: 'adaptive_check_in',
        sub_score: snapshot.sub_score,
        hrv_trend_down: adaptive.hrv_trend_down,
        planned_rpe_high: adaptive.planned_rpe_high,
        recorded_for,
      },
    }).catch(() => undefined);
  }

  return {
    checkin_id: rows[0]!.id,
    recorded_for,
    adaptive_flag: adaptive.flag,
    hrv_trend_down: adaptive.hrv_trend_down,
    planned_rpe_high: adaptive.planned_rpe_high,
  };
}

async function evaluateAdaptive(args: {
  sql: Sql;
  athlete_id: bigint;
  snapshot: CheckinSnapshot;
  recorded_for: string;
}): Promise<{ flag: string | null; hrv_trend_down: boolean; planned_rpe_high: boolean }> {
  const { sql, athlete_id, snapshot, recorded_for } = args;

  // Rule: sub_score must be in the danger band first; if not, skip the
  // expensive HRV/RPE lookups.
  if (snapshot.sub_score >= 40) {
    return { flag: null, hrv_trend_down: false, planned_rpe_high: false };
  }

  const hrv_trend_down = await isHrvTrendDown({ sql, athlete_id });
  const planned_rpe_high = await isPlannedRpeHigh({ sql, athlete_id, recorded_for });

  if (hrv_trend_down && planned_rpe_high) {
    return { flag: 'consider_swap_z2_30', hrv_trend_down, planned_rpe_high };
  }
  return { flag: null, hrv_trend_down, planned_rpe_high };
}

async function isHrvTrendDown(args: { sql: Sql; athlete_id: bigint }): Promise<boolean> {
  const { sql, athlete_id } = args;
  // Compare last 24h HRV avg vs the prior 6-day avg. Down if last is at
  // least 5% lower (typical élite-grade threshold).
  const aid = athlete_id as unknown as number;
  const rows = await sql<{ recent: string | null; baseline: string | null }[]>`
    with recent as (
      select avg(value_numeric)::text as recent
      from biometric_streams
      where athlete_id = ${aid}
        and metric_type = 'hrv'
        and recorded_at > now() - interval '24 hours'
    ),
    base as (
      select avg(value_numeric)::text as baseline
      from biometric_streams
      where athlete_id = ${aid}
        and metric_type = 'hrv'
        and recorded_at between now() - interval '7 days' and now() - interval '24 hours'
    )
    select recent, baseline from recent, base
  `;
  const recent = Number(rows[0]?.recent ?? 'NaN');
  const baseline = Number(rows[0]?.baseline ?? 'NaN');
  if (!Number.isFinite(recent) || !Number.isFinite(baseline) || baseline === 0) return false;
  return recent < baseline * 0.95;
}

async function isPlannedRpeHigh(args: {
  sql: Sql;
  athlete_id: bigint;
  recorded_for: string;
}): Promise<boolean> {
  const { sql, athlete_id, recorded_for } = args;
  // Look at today's scheduled assignment + its template.target_rpe (if the
  // template carries one). We treat any session whose template_format is
  // 'hyrox_sim', 'amrap', 'for_time', 'emom' as RPE >= 8 by default.
  const rows = await sql<{ format: string; rpe: number | null }[]>`
    select t.format::text as format, null::int as rpe
    from workout_assignments wa
    join templates t on t.id = wa.template_id
    where wa.athlete_id = ${athlete_id as unknown as number}
      and wa.scheduled_for = ${recorded_for}::date
    limit 1
  `;
  const r = rows[0];
  if (!r) return false;
  const intenseFormats = new Set(['hyrox_sim', 'amrap', 'for_time', 'emom', 'intervals']);
  return intenseFormats.has(r.format);
}
