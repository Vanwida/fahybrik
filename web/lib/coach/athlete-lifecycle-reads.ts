// Athlete lifecycle READ helpers (#13) — split out of athlete-lifecycle.ts to keep each
// file under the 500-line cap. Everything here is re-exported from athlete-lifecycle.ts,
// so callers still import from the single '@/lib/coach/athlete-lifecycle' path.
//
// These are the contracts the coach UI, iOS, and the ADHERENCE agent consume.

import { sql } from '@/lib/db';
import type {
  AthleteLifecycleStatus,
  PauseReason,
  PauseRequestedBy,
} from '@fahybrid/shared/domain/coach/athlete-lifecycle';

/** A pause window for the adherence agent. end_date null = still open ⇒ "up to today". */
export interface PauseInterval {
  start_date: string; // ISO YYYY-MM-DD
  end_date: string | null; // ISO YYYY-MM-DD, or null while the pause is open
}

/** An open pause row (currently paused). Carries athlete_id for the roster-wide read. */
export interface OpenPauseInterval extends PauseInterval {
  athlete_id: string;
  reason: PauseReason;
  requested_by: PauseRequestedBy;
}

export interface AthleteLifecycle {
  athlete_id: string;
  lifecycle_status: AthleteLifecycleStatus;
  baja_at: string | null; // ISO instant
  baja_reason: string | null;
  /** The currently-open pause, if the athlete is paused. */
  open_pause: PauseInterval | null;
}

/** Full lifecycle snapshot for one athlete (state + the open pause, if any). */
export async function getAthleteLifecycle(athlete_id: bigint): Promise<AthleteLifecycle | null> {
  const rows = await sql<
    {
      athlete_id: string;
      lifecycle_status: AthleteLifecycleStatus;
      baja_at: Date | null;
      baja_reason: string | null;
      open_start: string | null;
      open_end: string | null;
    }[]
  >`
    select
      a.id::text as athlete_id,
      a.lifecycle_status,
      a.baja_at,
      a.baja_reason,
      p.start_date::text as open_start,
      p.end_date::text as open_end
    from athletes a
    left join lateral (
      select start_date, end_date from athlete_pauses
      where athlete_id = a.id and end_date is null
      order by start_date desc
      limit 1
    ) p on true
    where a.id = ${athlete_id}
    limit 1
  `;
  const r = rows[0];
  if (!r) return null;
  return {
    athlete_id: r.athlete_id,
    lifecycle_status: r.lifecycle_status,
    baja_at: r.baja_at ? r.baja_at.toISOString() : null,
    baja_reason: r.baja_reason,
    open_pause: r.open_start ? { start_date: r.open_start, end_date: r.open_end } : null,
  };
}

/**
 * The currently-OPEN pause intervals (end_date null ⇒ paused right now). Pass an
 * athlete_id for one athlete, or omit for every currently-paused athlete on the
 * roster (the coach's "who is paused" view).
 */
export async function listOpenPauseIntervals(athlete_id?: bigint): Promise<OpenPauseInterval[]> {
  const rows = athlete_id
    ? await sql<
        {
          athlete_id: string;
          start_date: string;
          reason: PauseReason;
          requested_by: PauseRequestedBy;
        }[]
      >`
        select athlete_id::text as athlete_id, start_date::text as start_date, reason, requested_by
        from athlete_pauses
        where end_date is null and athlete_id = ${athlete_id}
        order by start_date desc
      `
    : await sql<
        {
          athlete_id: string;
          start_date: string;
          reason: PauseReason;
          requested_by: PauseRequestedBy;
        }[]
      >`
        select athlete_id::text as athlete_id, start_date::text as start_date, reason, requested_by
        from athlete_pauses
        where end_date is null
        order by athlete_id, start_date desc
      `;
  return rows.map((r) => ({
    athlete_id: r.athlete_id,
    start_date: r.start_date,
    end_date: null,
    reason: r.reason,
    requested_by: r.requested_by,
  }));
}

/**
 * ALL pause intervals for an athlete (open + historical), oldest first — the contract
 * the ADHERENCE agent consumes. Each interval's end_date is null while open; treat
 * null as "up to today" and exclude the range [start_date, coalesce(end_date, today)]
 * from adherence. Pair with isDateInAnyPause() for a per-day check.
 *
 * Equivalent set-based SQL the adherence agent can inline instead (excludes any
 * executed workout that fell inside a pause), documented here so it stays in sync:
 *
 *   where not exists (
 *     select 1 from athlete_pauses ap
 *     where ap.athlete_id = <athlete>
 *       and <day> >= ap.start_date
 *       and <day> <= coalesce(ap.end_date, current_date)
 *   )
 */
export async function getAthletePauseIntervals(athlete_id: bigint): Promise<PauseInterval[]> {
  const rows = await sql<{ start_date: string; end_date: string | null }[]>`
    select start_date::text as start_date, end_date::text as end_date
    from athlete_pauses
    where athlete_id = ${athlete_id}
    order by start_date asc
  `;
  return rows.map((r) => ({ start_date: r.start_date, end_date: r.end_date }));
}

/**
 * Pure day-level check the adherence agent can reuse in JS: is `iso` (YYYY-MM-DD)
 * inside any pause interval? An open interval (end_date null) is treated as running
 * up to `todayIso`. All three args are ISO calendar days, so string comparison is a
 * correct chronological compare.
 */
export function isDateInAnyPause(
  iso: string,
  intervals: PauseInterval[],
  todayIso: string,
): boolean {
  return intervals.some((iv) => {
    const end = iv.end_date ?? todayIso;
    return iso >= iv.start_date && iso <= end;
  });
}
