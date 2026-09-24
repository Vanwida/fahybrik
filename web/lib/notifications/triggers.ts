// Server-side trigger helpers for the notification fan-out. Each function is
// idempotent on (kind, athlete, dedupe_key) by checking notifications.payload_json
// before inserting — otherwise a re-run would spam the coach with duplicates.

import type { Sql } from '@/lib/db';
import { BOX_TIMEZONE } from '@fahybrid/shared/domain/dates';
import type { AthleteSignal } from '@fahybrid/shared/domain/coach/athlete-state';
import type { SignalKind } from '@fahybrid/shared/domain/coach/signals';
import { loadAthleteSignals } from '@/lib/coach/attention/signals-read';
import { notifyAthlete, notifyCoach } from './dispatch';

// =============================================================================
// Workout edited
// =============================================================================
//
// The coach edits an athlete's assigned workout → notif to that athlete with the
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
// Avisos al coach de las señales del cuerpo (cron diario)
// =============================================================================
//
// El cron NO decide nada: empuja al móvil del coach las señales que el motor de
// Hoy YA decidió con SUS umbrales y persistió (`coach_attention_items`, barrido
// cada 15 min), vivas (ni pospuestas ni hechas: `loadAthleteSignals`). Antes
// tenía reglas propias: «check-in saltado» a CUALQUIER atleta sin check-in en 48 h
// (también a quien nunca lo hace, contra `checkin_habit_min`) y «HRV bajo» con
// una caída del 10 % frente a 7 días (contra `hrv_crash_delta_ms` y la base mínima
// de 14 días). Y al atleta le mandaba «Tu HRV ↓X %. Considera Z2 hoy.»: un
// consejo de entrenamiento en nombre de un coach que no lo eligió. Eso se va: lo
// que se le dice al atleta lo decide su coach.
//
// Una vez por episodio: el aviso lleva la `dedupe_key` de la señal, así que el
// mismo episodio no se repite cada mañana y uno nuevo sí avisa.

/** Una señal viva de Hoy de un tipo, con quién es. */
interface LiveSignalRow {
  athlete_id: string;
  full_name: string;
  signal: AthleteSignal;
}

async function liveSignalsOfKind(sql: Sql, kind: SignalKind): Promise<LiveSignalRow[]> {
  const coaches = await sql<Array<{ coach_id: string }>>`
    select distinct coach_id::text as coach_id
    from coach_attention_items
    where signal_kind = ${kind}
  `;
  const out: LiveSignalRow[] = [];
  for (const { coach_id } of coaches) {
    const read = await loadAthleteSignals({ coach_id: Number(coach_id), client: sql });
    const hits: Array<{ athlete_id: string; signal: AthleteSignal }> = [];
    for (const [athlete_id, r] of read) {
      const signal = r.live.find((s) => s.kind === kind);
      if (signal) hits.push({ athlete_id, signal });
    }
    if (hits.length === 0) continue;
    const names = await sql<Array<{ id: string; full_name: string }>>`
      select id::text, full_name from athletes where id = any(${hits.map((h) => Number(h.athlete_id))}::bigint[])
    `;
    const nameOf = new Map(names.map((n) => [n.id, n.full_name]));
    for (const h of hits) out.push({ ...h, full_name: nameOf.get(h.athlete_id) ?? 'Atleta' });
  }
  return out;
}

async function alreadyNotified(sql: Sql, kind: SignalKind, row: LiveSignalRow): Promise<boolean> {
  const rows = await sql<Array<{ one: number }>>`
    select 1 as one from notifications
    where type = 'recovery_alert'
      and payload_json->>'kind' = ${kind}
      and payload_json->>'athlete_id' = ${row.athlete_id}
      and payload_json->>'dedupe_key' = ${row.signal.dedupe_key}
    limit 1
  `;
  return rows.length > 0;
}

/** Empuja al coach (a todos sus miembros) cada señal viva de `kind` aún no avisada. */
async function pushLiveSignals(sql: Sql, kind: SignalKind, title: string): Promise<{ flagged: number }> {
  let flagged = 0;
  for (const row of await liveSignalsOfKind(sql, kind)) {
    if (await alreadyNotified(sql, kind, row)) continue;
    await notifyCoach({
      sql,
      athlete_id: BigInt(row.athlete_id),
      type: 'recovery_alert',
      payload: {
        kind,
        athlete_id: row.athlete_id,
        athlete_name: row.full_name,
        dedupe_key: row.signal.dedupe_key,
        label: row.signal.label,
        evidence: row.signal.evidence,
      },
      push: {
        title,
        body: `${row.full_name} · ${row.signal.label}`,
        deeplink: { kind: 'cohort_athlete', athlete_id: row.athlete_id },
      },
    });
    flagged += 1;
  }
  return { flagged };
}

/** «Check-in saltado»: la señal de Hoy (solo quien tiene el hábito y lo rompe). */
export function checkSkippedCheckins(args: { sql: Sql }): Promise<{ flagged: number }> {
  return pushLiveSignals(args.sql, 'checkin_skipped', 'Check-in saltado');
}

/** «VFC hundida»: la señal de Hoy (umbral del sistema y base mínima de 14 días). Solo al coach. */
export function checkHrvCrashes(args: { sql: Sql }): Promise<{ flagged: number }> {
  return pushLiveSignals(args.sql, 'hrv_crash', 'VFC baja');
}

// =============================================================================
// Race day countdown
// =============================================================================
//
// Sends a 24h-before-race notif for each athlete's TARGET race (unified spine,
// priority='target'). Designed to run from a daily cron (vercel.json). The 2h/30m
// sub-day checkpoints are blocked until a timestamptz race start lands — races
// store race_date, which gives day-level granularity.
//
// The days left are counted in the ATHLETE's calendar, per row (his race;
// DECISIONS «Qué día es en cada sitio»): «mañana» is his tomorrow, not the UTC
// one — in Auckland the UTC date is still his yesterday until about midday.

export async function checkRaceCountdown(args: { sql: Sql; now?: Date }): Promise<{ sent: number }> {
  const now = args.now ?? new Date();
  // `event_id` in the row + notification payload is the races.id post-unification
  // (the dedup key is self-consistent: it matches against the same payload key).
  const rows = await args.sql<
    { athlete_id: string; event_id: string; event_name: string; days_to: string }[]
  >`
    select r.athlete_id::text as athlete_id,
           r.id::text as event_id,
           r.name as event_name,
           d.days_to::text as days_to
    from races r
    join athletes a on a.id = r.athlete_id
    cross join lateral (
      select r.race_date
             - (${now.toISOString()}::timestamptz at time zone coalesce(a.timezone, ${BOX_TIMEZONE}))::date as days_to
    ) d
    where r.priority = 'target'
      and r.status in ('planned', 'registered')
      and d.days_to in (1, 7)
      and not exists (
        select 1 from notifications n
        where n.user_id = a.user_id
          and n.type = 'event_reminder'
          and n.payload_json->>'event_id' = r.id::text
          and n.payload_json->>'checkpoint' = d.days_to::text
      )
  `;
  let sent = 0;
  for (const r of rows) {
    const days = Number(r.days_to);
    // Solo el hecho (la fecha): lo que haga esa semana lo dice su coach, no un
    // texto nuestro en su nombre («Foco en taper» era método de alguien).
    const title = days === 1 ? 'Tu carrera es mañana' : 'Tu carrera, en 7 días';
    const body = days === 1 ? `${r.event_name}: mañana.` : `${r.event_name}: dentro de una semana.`;
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
