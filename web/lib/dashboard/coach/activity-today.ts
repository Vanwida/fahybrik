import 'server-only';

// activity-today — the "Actividad de hoy" ambient glance for /hoy (SABER layer).
// Unlike the triage queue (which trends to ZERO as the coach clears it), this is
// a REVIEW-AT-SCALE readout: what the roster actually logged today, newest first,
// so the coach can glance + lightly encourage without it ever becoming a queue.
//
// One indexed read: today's workout_executions for the coach's athletes, joined
// to their assignment + template (session name + format) so each row reads as a
// dense line (athlete · session · key result · adherence dot). Bounded to a top-N
// for the rail (the drawer asks for more) — we NEVER select the whole day inline.
//
// ── REAL-DATA vs FLAGGED GAP (build-right honesty) ────────────────────────────
// The athlete / session / duration / RPE / ended_at columns are REAL. The
// adherence BAND, however, is reported `no_detail` for every row right now: a
// real green/amber/red verdict needs the prescribed-vs-real evaluator
// (`shared/domain/adherence/compute.ts`, the F6 module that does NOT yet exist —
// only `bands.ts` config does) plus segment-level prescribed values to compare
// against. Until that lands, `off_target_count` is 0 and the dot renders neutral.
// We do NOT fabricate a band from RPE alone — that would be a different metric
// wearing adherence's clothes. See the flag in the F3 handoff.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isoDateString, startOfDayInBox } from '@fahybrid/shared/domain/dates';
import type { AdherenceBand } from '@fahybrid/shared/domain/adherence';
import { formatRelative } from '@/lib/dashboard/relative-time';

/** How many rows the rail glance shows before "Ver todas" opens the drawer. */
export const ACTIVITY_GLANCE_LIMIT = 4;
/** Hard cap for the "Ver todas" drawer — we never render an unbounded list. */
export const ACTIVITY_DRAWER_LIMIT = 60;

/** Legible label per `templates.format` (single source for the glance). */
const TEMPLATE_FORMAT_LABEL: Record<string, string> = {
  amrap: 'AMRAP',
  for_time: 'For Time',
  emom: 'EMOM',
  intervals: 'Intervalos',
  strength_block: 'Fuerza',
  hyrox_sim: 'Simulación HYROX',
  tempo: 'Tempo',
  circuit: 'Circuito',
};

function formatLabel(format: string | null): string | null {
  if (!format) return null;
  return TEMPLATE_FORMAT_LABEL[format] ?? format.replace(/_/g, ' ');
}

/** A single logged session for the activity glance. */
export interface ActivitySession {
  /** Stable row id, e.g. "exec:1234" (the execution id). */
  id: string;
  athlete_id: string;
  athlete_name: string;
  /** Template name, e.g. "HYROX Sim · Bloque 3". */
  session_name: string;
  /** Legible format label, e.g. "Simulación HYROX" (null when no format). */
  format_label: string | null;
  /** One-line key result, e.g. "48 min · RPE 8" (built from real columns). */
  result: string;
  /** Adherence band — `no_detail` until the F6 compute lands (see header). */
  adherence: AdherenceBand;
  /** Short age of when the session ended, e.g. "hace 2 h". */
  age_label: string;
  /** Whether the coach has already reacted (always false until reactions ship). */
  reacted: boolean;
}

export interface ActivityToday {
  /** Newest-first sessions (capped — the rail slices to ACTIVITY_GLANCE_LIMIT). */
  sessions: ActivitySession[];
  /** Total sessions logged today (may exceed sessions.length when capped). */
  total: number;
  /** Sessions whose adherence is off_target — 0 until F6 compute lands. */
  off_target_count: number;
}

/** Human "X min · RPE n" from the real execution columns (omits null parts). */
function buildResult(durationSeconds: number | null, rpe: number | null): string {
  const parts: string[] = [];
  if (durationSeconds != null && durationSeconds > 0) {
    const minutes = Math.round(durationSeconds / 60);
    parts.push(`${minutes} min`);
  }
  if (rpe != null) parts.push(`RPE ${rpe}`);
  return parts.length > 0 ? parts.join(' · ') : 'Completada';
}

type ActivityRow = {
  execution_id: string;
  athlete_id: string;
  athlete_name: string;
  session_name: string;
  format: string | null;
  total_duration_seconds: number | null;
  perceived_exertion: number | null;
  logged_at: string | null;
};

/**
 * Today's logged sessions for the coach's roster, newest-first. `limit` bounds
 * the rows fetched (rail asks for ACTIVITY_GLANCE_LIMIT, the drawer for more);
 * `total` is the real count so "+N más" / the header stay honest under the cap.
 */
export async function loadActivityToday(params: {
  coach_id: number | bigint;
  limit?: number;
  client?: Sql;
}): Promise<ActivityToday> {
  const client = params.client ?? defaultSql;
  const limit = Math.min(Math.max(params.limit ?? ACTIVITY_GLANCE_LIMIT, 1), ACTIVITY_DRAWER_LIMIT);
  const todayIso = isoDateString(startOfDayInBox(new Date()));

  // Count + page in one round-trip: total over the window (for the header) and
  // the newest `limit` rows (for the render). `logged_at` coalesces the most
  // meaningful timestamp so a session with only a started_at still sorts.
  const [counts, rows] = await Promise.all([
    client<Array<{ total: number }>>`
      select count(*)::int as total
      from workout_executions we
      join workout_assignments wa on wa.id = we.assignment_id
      join athletes a on a.id = we.athlete_id
      where a.coach_id = ${params.coach_id as number}
        and coalesce(we.ended_at, we.started_at, we.created_at)::date = ${todayIso}::date
    `,
    client<ActivityRow[]>`
      select
        we.id::text as execution_id,
        we.athlete_id::text as athlete_id,
        a.full_name as athlete_name,
        t.name as session_name,
        t.format::text as format,
        we.total_duration_seconds,
        we.perceived_exertion,
        coalesce(we.ended_at, we.started_at, we.created_at)::text as logged_at
      from workout_executions we
      join workout_assignments wa on wa.id = we.assignment_id
      join templates t on t.id = wa.template_id
      join athletes a on a.id = we.athlete_id
      where a.coach_id = ${params.coach_id as number}
        and coalesce(we.ended_at, we.started_at, we.created_at)::date = ${todayIso}::date
      order by coalesce(we.ended_at, we.started_at, we.created_at) desc
      limit ${limit}
    `,
  ]);

  const sessions: ActivitySession[] = rows.map((r) => ({
    id: `exec:${r.execution_id}`,
    athlete_id: r.athlete_id,
    athlete_name: r.athlete_name,
    session_name: r.session_name,
    format_label: formatLabel(r.format),
    result: buildResult(r.total_duration_seconds, r.perceived_exertion),
    // FLAGGED GAP: real band requires F6 compute + prescribed segment values.
    adherence: 'no_detail',
    age_label: r.logged_at ? formatRelative(r.logged_at) : '',
    // FLAGGED GAP: no reactions table yet → never "already reacted".
    reacted: false,
  }));

  return {
    sessions,
    total: counts[0]?.total ?? 0,
    // FLAGGED GAP: 0 until adherence compute lands (see file header).
    off_target_count: 0,
  };
}
