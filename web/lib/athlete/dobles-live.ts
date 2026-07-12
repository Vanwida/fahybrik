import 'server-only';

import { z } from 'zod';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';

// =============================================================================
// DOBLES LIVE PRESENCE — the read/write core behind /api/athlete/dobles/live.
//
// The two athletes of a doubles pair usually train in different gyms. Each phone
// sends a heartbeat (~every 5 s) while it works out; the partner's phone reads the
// latest one. This is transient PRESENCE (one upserted row per athlete, table
// dobles_live_status 0128) — never the durable record, which stays in
// workout_executions.
//
// The route stays thin (auth + partner resolution + HTTP mapping); the honesty
// lives here: ownership of the assignment, the self_only privacy gate, and the
// "final_* only on finished" normalization. Both functions take an injectable
// `client` so the real-DB tests exercise the exact SQL.
// =============================================================================

/** Closed set of live phases. Single source shared by the Zod input + the reader. */
export const LIVE_PHASES = ['active', 'paused', 'finished', 'left'] as const;
export type LivePhase = (typeof LIVE_PHASES)[number];

/**
 * Presence expires after 6 h: a row older than this is not shown at all (the app
 * was closed long ago). Distinct from the client's "sin señal" cue, which it draws
 * from age_s over a much shorter (~20 s) window — a live partner who missed a few
 * heartbeats is still present, just momentarily silent.
 */
export const PRESENCE_MAX_AGE_HOURS = 6;

// Plausible-human heart-rate band (mirrors the DB CHECK) and the RPE scale bounds.
const HR_MIN = 20;
const HR_MAX = 250;
const RPE_MIN = 0;
const RPE_MAX = 10;
const WORKOUT_TITLE_MAX = 200;
const BLOCK_NAME_MAX = 120;
const PROGRESS_TEXT_MAX = 200;

/** Heartbeat payload the athlete's phone POSTs. Validated server-side (Zod). */
export const liveStatusInputSchema = z.object({
  assignment_id: z.coerce.number().int().positive(),
  phase: z.enum(LIVE_PHASES),
  workout_title: z.string().trim().min(1).max(WORKOUT_TITLE_MAX),
  block_name: z.string().trim().max(BLOCK_NAME_MAX).nullish(),
  progress_text: z.string().trim().max(PROGRESS_TEXT_MAX).nullish(),
  elapsed_s: z.coerce.number().int().min(0),
  hr_bpm: z.coerce.number().int().min(HR_MIN).max(HR_MAX).nullish(),
  final_time_s: z.coerce.number().int().min(0).nullish(),
  final_rpe: z.coerce.number().min(RPE_MIN).max(RPE_MAX).nullish(),
});
export type LiveStatusInput = z.infer<typeof liveStatusInputSchema>;

export type SaveLiveResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'session_private' };

/**
 * Persist one heartbeat for `athleteId` (upsert — one row per athlete). Enforces,
 * in order:
 *   1. ownership — the assignment must be the caller's OWN (else 'not_found', so we
 *      never leak another athlete's session by broadcasting presence for it);
 *   2. privacy — a 'self_only' assignment must NEVER emit presence ('session_private').
 * Then upserts, normalizing final_* to NULL unless the phase is 'finished' so a live
 * row can never claim a finish time it doesn't have.
 */
export async function saveDoblesLiveStatus(
  params: { athleteId: number; input: LiveStatusInput },
  client: Sql = defaultSql,
): Promise<SaveLiveResult> {
  const { athleteId, input } = params;
  const assignmentId = input.assignment_id;

  // Ownership + current visibility in one read (scoped to the caller's own row).
  const rows = await client<{ partner_visibility: 'shared' | 'self_only' }[]>`
    select partner_visibility
    from workout_assignments
    where id = ${assignmentId} and athlete_id = ${athleteId}
    limit 1
  `;
  const row = rows[0];
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.partner_visibility === 'self_only') return { ok: false, reason: 'session_private' };

  // HONEST NORMALIZATION — final_time_s / final_rpe describe a FINISHED session
  // only. On any non-finished heartbeat we store NULL regardless of what the client
  // sent, so a live row can never advertise a final result.
  const finished = input.phase === 'finished';
  const finalTimeS = finished ? input.final_time_s ?? null : null;
  const finalRpe = finished ? input.final_rpe ?? null : null;

  await client`
    insert into dobles_live_status (
      athlete_id, assignment_id, phase, workout_title, block_name,
      progress_text, elapsed_s, hr_bpm, final_time_s, final_rpe, updated_at
    ) values (
      ${athleteId}, ${assignmentId}, ${input.phase}, ${input.workout_title},
      ${input.block_name ?? null}, ${input.progress_text ?? null}, ${input.elapsed_s},
      ${input.hr_bpm ?? null}, ${finalTimeS}, ${finalRpe}, now()
    )
    on conflict (athlete_id) do update set
      assignment_id = excluded.assignment_id,
      phase         = excluded.phase,
      workout_title = excluded.workout_title,
      block_name    = excluded.block_name,
      progress_text = excluded.progress_text,
      elapsed_s     = excluded.elapsed_s,
      hr_bpm        = excluded.hr_bpm,
      final_time_s  = excluded.final_time_s,
      final_rpe     = excluded.final_rpe,
      updated_at    = now()
  `;
  return { ok: true };
}

/** The partner's live presence as the client consumes it (snake_case). */
export interface PartnerLiveStatus {
  /** Partner's first name (resolved by the caller from the training-pair loader). */
  name: string;
  phase: LivePhase;
  workout_title: string;
  block_name: string | null;
  progress_text: string | null;
  elapsed_s: number;
  hr_bpm: number | null;
  /** Set only when phase='finished'. */
  final_time_s: number | null;
  final_rpe: number | null;
  /** Seconds since the partner's last heartbeat, computed on the SERVER. Drives
   *  "hace X s" and the client's "sin señal" cue. */
  age_s: number;
}

/**
 * The partner's current presence, or `{ partner: null }` when there is no row or it
 * has expired (older than PRESENCE_MAX_AGE_HOURS — filtered in SQL so a stale row
 * reads as absent). A phase='finished' row within the window is still returned so
 * the client can show "ha terminado — 47:12".
 */
export async function loadPartnerLiveStatus(
  params: { partnerAthleteId: number; partnerName: string },
  client: Sql = defaultSql,
): Promise<{ partner: PartnerLiveStatus | null }> {
  const rows = await client<
    {
      phase: LivePhase;
      workout_title: string;
      block_name: string | null;
      progress_text: string | null;
      elapsed_s: number;
      hr_bpm: number | null;
      final_time_s: number | null;
      final_rpe: number | null;
      age_s: number;
    }[]
  >`
    select
      phase,
      workout_title,
      block_name,
      progress_text,
      elapsed_s,
      hr_bpm,
      final_time_s,
      final_rpe::float8 as final_rpe,
      extract(epoch from now() - updated_at)::int as age_s
    from dobles_live_status
    where athlete_id = ${params.partnerAthleteId}
      and updated_at > now() - make_interval(hours => ${PRESENCE_MAX_AGE_HOURS}::int)
    limit 1
  `;
  const row = rows[0];
  if (!row) return { partner: null };

  return {
    partner: {
      name: params.partnerName,
      phase: row.phase,
      workout_title: row.workout_title,
      block_name: row.block_name,
      progress_text: row.progress_text,
      elapsed_s: row.elapsed_s,
      hr_bpm: row.hr_bpm,
      final_time_s: row.final_time_s,
      final_rpe: row.final_rpe,
      age_s: row.age_s,
    },
  };
}
