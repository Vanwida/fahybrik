// v2 · MENSAJES — server data loader for the 3-column chat screen.
//
// Joins the coach's chat threads (the conversation list) with the roster rows
// (the per-athlete context panel), keyed by athlete_id, so the client renders a
// thread + its context without any extra round-trip. Both sources are REAL and
// already used elsewhere (Hoy lanes, roster table); this module only projects +
// derives the display shapes. No invented data: a thread whose athlete is not in
// the roster load gets `context: null` (the panel shows a calm fallback).
//
// Pure server module — the page calls it, then hands `MensajesData` to the client.

import 'server-only';
import type { Sql } from '@/lib/db';
import { listThreadsForCoach } from '@/lib/chat/service';
import { fetchAthletesForCoach, type AthleteRow } from '@/lib/dashboard/athletes/list';
import { athleteLevel } from '@/lib/dashboard/v2/level';
import type { V2Status } from '@/components/v2/StatusDot';
import type { MensajesContext, MensajesData, MensajesThread } from './mensajes-types';

/** Derive the account/training status dot from a roster row. Mirrors the
 *  roster/Hoy semantics so the same athlete reads the same in every surface:
 *    intake pending → alta (onboarding) · any active alert → atención · else activa.
 *  (`pausa` would require an inactive-subscription signal the roster row does not
 *  expose here; it is reserved for when that field lands — TODO(model).) */
function statusFromRow(a: AthleteRow): V2Status {
  if (a.intake_pending) return 'alta';
  if (a.alert_severity != null) return 'atencion';
  return 'activa';
}

/** Build the "Acumulación · sem 2"-style label from the coach's microciclo name,
 *  or null when the athlete has no active microciclo. */
function phaseLabelFromRow(a: AthleteRow): string | null {
  if (!a.block_type) return null;
  const phase = a.block_type;
  return a.block_week != null ? `${phase} · sem ${a.block_week}` : phase;
}

function contextFromRow(a: AthleteRow): MensajesContext {
  return {
    level: athleteLevel(a),
    status: statusFromRow(a),
    phase_label: phaseLabelFromRow(a),
    adherence_pct: a.compliance_pct,
    readiness_score: a.readiness_score,
    alert_label: a.alert_label,
  };
}

export async function loadMensajesData(params: {
  coach_id: number | bigint;
  client?: Sql;
}): Promise<MensajesData> {
  // Independent loads — a dead roster load degrades context to null, never 500s
  // the screen (the conversations themselves still render).
  const [threadRows, roster] = await Promise.all([
    listThreadsForCoach({ coach_id: params.coach_id, sql: params.client }),
    fetchAthletesForCoach({ coach_id: params.coach_id, client: params.client }).catch(
      (): AthleteRow[] => [],
    ),
  ]);

  const rosterById = new Map<string, AthleteRow>(roster.map((a) => [a.athlete_id, a]));

  const threads: MensajesThread[] = threadRows.map((t) => {
    const row = rosterById.get(t.athlete_id);
    return {
      thread_id: t.thread_id,
      athlete_id: t.athlete_id,
      athlete_name: t.athlete_full_name,
      last_message_body: t.last_message_body,
      last_message_at: t.last_message_at,
      unread_count: t.unread_count,
      context: row ? contextFromRow(row) : null,
    };
  });

  return {
    threads,
    unread_threads: threads.filter((t) => t.unread_count > 0).length,
  };
}
