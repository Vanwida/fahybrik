import 'server-only';

// ADHERENCE OVER A TRAILING WINDOW — the one due-only rule (plan §4.2).
//
// These two readers used to count `completed / scheduled` over the window with
// their own SQL: today's not-yet-done session and a hidden (draft) week counted
// as missed, `partial` did not count as done. They now read the SAME rows and
// rule as the roster, Hoy and the ficha — `loadAdherenceSessionsBatch` +
// `computeAdherence` (shared/domain/coach/adherence.ts): a session is due if its
// day passed (or it is today and done), self-logged, paused and injury-rest days
// never count, a hidden week counts only if it was done anyway. Nothing due is
// NULL, never 0 %.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  computeAdherence,
  isSessionDone,
  loadAdherenceSessionsBatch,
} from '@fahybrid/shared/domain/coach/adherence';
import type { DailyAssignmentCount } from '@fahybrid/shared/domain/coach/race-readiness';

/**
 * Due and done sessions per day over the `days + 1` days ending `on_date` (the
 * athlete's own day), under the due-only rule as of `on_date`. One row per day
 * with sessions, so a MOVING window is a sum (the 90-day readiness trend).
 * `scheduled` = due, `completed` = done.
 */
export async function loadDailyAssignmentCounts(params: {
  athlete_id: number | bigint;
  on_date: Date;
  days: number;
  client?: Sql;
}): Promise<DailyAssignmentCount[]> {
  const client = params.client ?? defaultSql;
  const key = String(params.athlete_id);
  const batch = await loadAdherenceSessionsBatch({
    client,
    athlete_ids: [params.athlete_id],
    window_days: params.days + 1,
    now: params.on_date,
  });
  const asOf = batch.as_of.get(key);
  if (!asOf) return [];
  const byDay = new Map<string, DailyAssignmentCount>();
  for (const s of batch.sessions.get(key) ?? []) {
    // Each session judged by the shared rule as of the athlete's today.
    if (computeAdherence([s], asOf, params.days + 1).due === 0) continue;
    const row = byDay.get(s.scheduled_for) ?? { date: s.scheduled_for, scheduled: 0, completed: 0 };
    row.scheduled += 1;
    if (isSessionDone(s)) row.completed += 1;
    byDay.set(s.scheduled_for, row);
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Adherence over the `days` days ending `on_date` (the athlete's day) as an
 * integer 0…100, or null when nothing was due — which is not the same as 0 %.
 */
export async function loadCompliancePct(params: {
  athlete_id: number | bigint;
  on_date: Date;
  days: number;
  client?: Sql;
}): Promise<number | null> {
  const client = params.client ?? defaultSql;
  const key = String(params.athlete_id);
  const batch = await loadAdherenceSessionsBatch({
    client,
    athlete_ids: [params.athlete_id],
    window_days: params.days,
    now: params.on_date,
  });
  const asOf = batch.as_of.get(key);
  if (!asOf) return null;
  return computeAdherence(batch.sessions.get(key) ?? [], asOf, params.days).pct;
}

/**
 * Several windows over ONE read (e.g. 7 d, 30 d and the whole history): each is
 * `computeAdherence` over the same due-only rows, ending the athlete's today.
 */
export async function loadAdherenceWindows(params: {
  athlete_id: number | bigint;
  on_date: Date;
  windows: ReadonlyArray<number>;
  client?: Sql;
}): Promise<Map<number, number | null>> {
  const client = params.client ?? defaultSql;
  const key = String(params.athlete_id);
  const longest = Math.max(1, ...params.windows);
  const batch = await loadAdherenceSessionsBatch({
    client,
    athlete_ids: [params.athlete_id],
    window_days: longest,
    now: params.on_date,
  });
  const asOf = batch.as_of.get(key);
  const out = new Map<number, number | null>();
  for (const w of params.windows) {
    out.set(w, asOf ? computeAdherence(batch.sessions.get(key) ?? [], asOf, w).pct : null);
  }
  return out;
}
