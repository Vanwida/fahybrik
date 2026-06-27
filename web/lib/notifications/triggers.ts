// Server-side trigger helpers for the notification fan-out described in the
// task brief. Each function is idempotent on (user_id, kind, dedupe_key) by
// checking notifications.payload_json before inserting — otherwise a cron run
// every minute would spam Pablo with duplicate alerts.

import type { Sql } from '@/lib/db';
import { dispatchNotification, notifyAthlete, notifyCoach } from './dispatch';

// =============================================================================
// Workout edited
// =============================================================================
//
// Pablo edits an athlete's assigned workout → notif to that athlete with the
// new template/notes. Caller (coach API for assignment update) wires this in
// after a successful update.

export async function notifyWorkoutEdited(args: {
  sql: Sql;
  athlete_id: bigint;
  assignment_id: string;
  scheduled_for: string;
  edit_summary: string;
}): Promise<void> {
  await notifyAthlete({
    sql: args.sql,
    athlete_id: args.athlete_id,
    type: 'workout_edited',
    payload: {
      assignment_id: args.assignment_id,
      scheduled_for: args.scheduled_for,
      edit_summary: args.edit_summary,
    },
    push: {
      title: 'Sesión actualizada',
      body: args.edit_summary,
      deeplink: { kind: 'today' },
    },
  });
}

// =============================================================================
// Daily check-in skipped 2 days
// =============================================================================
//
// Cron-triggered (lib/notifications/cron-checkin-skips). For each athlete in
// every active coach's cohort: if no daily_checkins row in last 48h AND no
// alert sent in the past 24h → notify coach.

export async function checkSkippedCheckins(args: { sql: Sql }): Promise<{ flagged: number }> {
  const rows = await args.sql<
    { athlete_id: string; coach_user_id: string; full_name: string }[]
  >`
    select a.id::text as athlete_id,
           c.user_id::text as coach_user_id,
           a.full_name
    from athletes a
    join coaches c on c.id = a.coach_id
    where not exists (
      select 1 from daily_checkins dc
      where dc.athlete_id = a.id
        and dc.recorded_for >= (current_date - interval '2 days')::date
    )
      and not exists (
        select 1 from notifications n
        where n.user_id = c.user_id
          and n.type = 'recovery_alert'
          and n.payload_json->>'kind' = 'checkin_skipped_2d'
          and n.payload_json->>'athlete_id' = a.id::text
          and n.created_at > now() - interval '24 hours'
      )
  `;
  for (const r of rows) {
    await dispatchNotification({
      sql: args.sql,
      user_id: BigInt(r.coach_user_id),
      type: 'recovery_alert',
      payload: {
        kind: 'checkin_skipped_2d',
        athlete_id: r.athlete_id,
        athlete_name: r.full_name,
      },
      push: {
        title: 'Check-in saltado',
        body: `${r.full_name} no completa check-in 2d`,
        deeplink: { kind: 'cohort_athlete', athlete_id: r.athlete_id },
      },
    });
  }
  return { flagged: rows.length };
}

// =============================================================================
// HRV crash detection
// =============================================================================
//
// Looks at last 24h vs prior 7d baseline; ≥10% drop with ≥3 samples in the
// window triggers a notif to athlete + coach.

export async function checkHrvCrashes(args: { sql: Sql }): Promise<{ flagged: number }> {
  const rows = await args.sql<
    {
      athlete_id: string;
      athlete_name: string;
      coach_user_id: string;
      recent: string;
      baseline: string;
    }[]
  >`
    with recent as (
      select athlete_id,
             avg(value_numeric)::text as recent,
             count(*) as n
      from biometric_streams
      where metric_type = 'hrv'
        and recorded_at > now() - interval '24 hours'
      group by athlete_id
      having count(*) >= 3
    ),
    base as (
      select athlete_id, avg(value_numeric)::text as baseline
      from biometric_streams
      where metric_type = 'hrv'
        and recorded_at between now() - interval '8 days' and now() - interval '24 hours'
      group by athlete_id
    )
    select a.id::text as athlete_id,
           a.full_name as athlete_name,
           c.user_id::text as coach_user_id,
           r.recent,
           b.baseline
    from athletes a
    join coaches c on c.id = a.coach_id
    join recent r on r.athlete_id = a.id
    join base b on b.athlete_id = a.id
    where r.recent::numeric < b.baseline::numeric * 0.90
      and not exists (
        select 1 from notifications n
        where n.user_id = c.user_id
          and n.type = 'recovery_alert'
          and n.payload_json->>'kind' = 'hrv_crash'
          and n.payload_json->>'athlete_id' = a.id::text
          and n.created_at > now() - interval '24 hours'
      )
  `;

  for (const r of rows) {
    const recent = Number(r.recent);
    const baseline = Number(r.baseline);
    const drop = Math.round(((baseline - recent) / baseline) * 100);

    await dispatchNotification({
      sql: args.sql,
      user_id: BigInt(r.coach_user_id),
      type: 'recovery_alert',
      payload: {
        kind: 'hrv_crash',
        athlete_id: r.athlete_id,
        athlete_name: r.athlete_name,
        drop_pct: drop,
        recent_avg_ms: recent,
        baseline_avg_ms: baseline,
      },
      push: {
        title: 'HRV bajo',
        body: `${r.athlete_name}: HRV ↓${drop}%`,
        deeplink: { kind: 'cohort_athlete', athlete_id: r.athlete_id },
      },
    });

    await notifyAthlete({
      sql: args.sql,
      athlete_id: BigInt(r.athlete_id),
      type: 'recovery_alert',
      payload: {
        kind: 'hrv_crash',
        drop_pct: drop,
        recent_avg_ms: recent,
        baseline_avg_ms: baseline,
      },
      push: {
        title: 'Recuperación baja',
        body: `Tu HRV ↓${drop}%. Considera Z2 hoy.`,
      },
    });
  }
  return { flagged: rows.length };
}

// =============================================================================
// Race day countdown
// =============================================================================
//
// Sends a 24h-before-race notif for each athlete's TARGET race (unified spine,
// priority='target'). Designed to run from a daily cron at 06:00 UTC. The 2h/30m
// sub-day checkpoints are blocked until a timestamptz race start lands — races
// store race_date, which gives day-level granularity.

export async function checkRaceCountdown(args: { sql: Sql }): Promise<{ sent: number }> {
  // `event_id` in the row + notification payload is the races.id post-unification
  // (the dedup key is self-consistent: it matches against the same payload key).
  const rows = await args.sql<
    { athlete_id: string; event_id: string; event_name: string; days_to: string }[]
  >`
    select r.athlete_id::text as athlete_id,
           r.id::text as event_id,
           r.name as event_name,
           (r.race_date - current_date)::text as days_to
    from races r
    where r.priority = 'target'
      and r.status in ('planned', 'registered')
      and r.race_date - current_date in (1, 7)
      and not exists (
        select 1 from notifications n
        join athletes a on a.user_id = n.user_id
        where a.id = r.athlete_id
          and n.type = 'event_reminder'
          and n.payload_json->>'event_id' = r.id::text
          and n.payload_json->>'checkpoint' = (r.race_date - current_date)::text
      )
  `;
  let sent = 0;
  for (const r of rows) {
    const days = Number(r.days_to);
    const title = days === 1 ? '24h para tu carrera' : '7 días para tu carrera';
    const body =
      days === 1
        ? `${r.event_name}: repasa el plan y prepara el kit.`
        : `${r.event_name}: semana clave. Foco en taper.`;
    await notifyAthlete({
      sql: args.sql,
      athlete_id: BigInt(r.athlete_id),
      type: 'event_reminder',
      payload: {
        event_id: r.event_id,
        event_name: r.event_name,
        checkpoint: r.days_to,
      },
      push: {
        title,
        body,
        deeplink: { kind: 'race_plan', event_id: r.event_id },
      },
    });
    sent += 1;
  }
  return { sent };
}

// =============================================================================
// Helper for chat send (also exposed for direct use by coach edit endpoints).
// =============================================================================

export { notifyAthlete, notifyCoach };
