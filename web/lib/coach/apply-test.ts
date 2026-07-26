import 'server-only';

// #34 — the coach puts a test in his athletes' plans. The action that did not exist.
//
// Until now a test only ever reached an athlete ONE way: the week-1 auto-scheduler, at
// the moment their FIRST plan was materialized. Which meant that for every athlete who
// already had a plan, the coach could configure his battery, see it correctly set to
// week 1, and nothing would ever happen — checked against production on 2026-07-26:
// four tests configured, zero test sessions in the entire database, seven active
// athletes. The athlete could start a test from their phone; the coach could not give
// them one.
//
// Everything downstream already works — the fork per athlete, the `is_test` badge, the
// execution → benchmark bridge that turns the number into zones or a 1RM, the athlete's
// "Tus tests". So this adds a hand, not a pipeline: it calls the same
// materializeTestForAthlete the athlete's own "Probarme" calls.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { listCoachTests } from '@/lib/coach/coach-tests';
import { materializeTestForAthlete } from '@/lib/coach/schedule-calibration';
import { addDays, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/dates';

export type ApplyTestError = 'test_not_found' | 'test_not_ready' | 'no_athletes';

/** What happened for one athlete. Every athlete gets an outcome — a partial failure
 *  never silently disappears, or the coach believes he scheduled something he didn't. */
export interface ApplyTestOutcome {
  athlete_id: string;
  full_name: string;
  /** ISO days the test was placed on (one per occurrence: the date + any repeats). */
  scheduled_for: string[];
  /** true when a session for this test already existed on that day and was reused. */
  reused: boolean;
  /** Sessions the athlete ALREADY had that day, so the coach hears about the pile-up
   *  from us instead of from the athlete. Empty when the day was free. */
  clashes: string[];
}

export interface ApplyTestResult {
  test_id: string;
  test_name: string;
  applied: ApplyTestOutcome[];
}

/**
 * Apply a test to a set of the coach's athletes, on a date, optionally repeating it.
 *
 * Scoped by coach on BOTH sides: the test must be his, and every athlete id is
 * re-resolved through `athletes.coach_id` — an id that is not on his roster is dropped
 * rather than trusted, so a hand-crafted request cannot write into someone else's plan.
 */
export async function applyTestToAthletes(params: {
  coach_id: number;
  test_id: number;
  athlete_ids: number[];
  /** ISO `YYYY-MM-DD`, box timezone. */
  date: string;
  /** Weeks until a re-test on the same weekday. Omit / 0 = no repeat. */
  repeat_in_weeks?: number | null;
  client?: Sql;
}): Promise<{ ok: true; data: ApplyTestResult } | { ok: false; error: ApplyTestError }> {
  const client = params.client ?? defaultSql;

  const tests = await listCoachTests(params.coach_id, {}, client);
  const test = tests.find((t) => Number(t.id) === params.test_id);
  if (!test) return { ok: false, error: 'test_not_found' };
  if (!test.template_id) return { ok: false, error: 'test_not_ready' };

  // Only athletes on THIS coach's roster, and never one who has left: a baja athlete
  // has a frozen plan, so writing a session into it would be inventing work nobody
  // will do. A paused athlete is allowed — they come back, and the coach may well be
  // scheduling the test FOR the day they return.
  if (params.athlete_ids.length === 0) return { ok: false, error: 'no_athletes' };
  const roster = await client<{ id: string; full_name: string }[]>`
    select id::text as id, full_name
    from athletes
    where coach_id = ${params.coach_id}
      and lifecycle_status <> 'baja'
      and id = any(${params.athlete_ids}::bigint[])
    order by full_name
  `;
  if (roster.length === 0) return { ok: false, error: 'no_athletes' };

  const dates = [params.date];
  if (params.repeat_in_weeks && params.repeat_in_weeks > 0) {
    dates.push(isoDateString(addDays(parseIsoDate(params.date), params.repeat_in_weeks * 7)));
  }

  const applied: ApplyTestOutcome[] = [];
  for (const athlete of roster) {
    const athlete_id = Number(athlete.id);
    // What they already had that day — read BEFORE writing, or the test we are about
    // to insert shows up as its own clash.
    const clashes = await loadDayClashes(client, athlete_id, params.date);

    const placed: string[] = [];
    let reused = false;
    for (const day of dates) {
      const res = await materializeTestForAthlete({
        client,
        athlete_id,
        test,
        scheduled_for: day,
        microcycle_id: null, // coach-placed: ad-hoc, not tied to a microcycle
      });
      if (!res.ok) continue; // test_not_ready is already ruled out above; be safe anyway
      placed.push(day);
      reused = reused || res.reused;
    }

    applied.push({
      athlete_id: athlete.id,
      full_name: athlete.full_name,
      scheduled_for: placed,
      reused,
      clashes,
    });
  }

  return { ok: true, data: { test_id: String(test.id), test_name: test.name, applied } };
}

/** Titles of the sessions an athlete already has on a day. Used to warn, never to block:
 *  the coach may well want the test on a hard day, but he should be the one deciding it.
 *
 *  The table is `templates` — NOT `workout_templates`, which does not exist. Getting
 *  that wrong took the whole apply down with a 500, because a query against a missing
 *  relation throws rather than returning nothing. */
async function loadDayClashes(client: Sql, athlete_id: number, date: string): Promise<string[]> {
  const rows = await client<{ title: string | null }[]>`
    select coalesce(t.name, 'Sesión') as title
    from workout_assignments wa
    left join templates t on t.id = wa.template_id
    where wa.athlete_id = ${athlete_id}
      and wa.scheduled_for = ${date}::date
      and wa.status <> 'skipped'
    order by wa.id
  `;
  return rows.map((r) => r.title ?? 'Sesión').filter(Boolean);
}

/**
 * How many athletes each of the coach's tests has actually reached, and how far they
 * got. This is the "Puesto a" column, and it exists because its absence is what let a
 * battery that reached nobody look exactly like one that worked.
 */
export async function loadTestReach(
  coach_id: number,
  client: Sql = defaultSql,
): Promise<Map<string, { athletes: number; done: number; pending: number }>> {
  const rows = await client<
    { test_id: string; athletes: number; done: number; pending: number }[]
  >`
    select
      wa.calibration_test_id::text                                as test_id,
      count(distinct wa.athlete_id)::int                          as athletes,
      count(*) filter (where wa.status = 'completed')::int         as done,
      count(*) filter (where wa.status not in ('completed','skipped'))::int as pending
    from workout_assignments wa
    join athletes a on a.id = wa.athlete_id
    join coach_calibration_tests cct on cct.id = wa.calibration_test_id
    where cct.coach_id = ${coach_id}
      and a.coach_id = ${coach_id}
    group by wa.calibration_test_id
  `;
  return new Map(rows.map((r) => [r.test_id, { athletes: r.athletes, done: r.done, pending: r.pending }]));
}

export interface RosterForApply {
  athlete_id: string;
  full_name: string;
  lifecycle_status: string;
  /** Last COMPLETED occurrence per test id — the fact that decides whether repeating
   *  it now is worth anything. Missing key = never done it. */
  last_done_by_test: Record<string, string>;
}

/**
 * The coach's athletes plus, per test, when each last completed it. Loaded with the
 * Tests screen so the "Aplicar" panel can show "último: hace 3 meses" next to every
 * name — which is what lets the coach choose seven athletes without opening seven
 * fichas, and what makes the "los que no lo han hecho nunca" shortcut honest.
 */
export async function loadRosterForApply(
  coach_id: number,
  client: Sql = defaultSql,
): Promise<RosterForApply[]> {
  const [athletes, history] = await Promise.all([
    client<{ id: string; full_name: string; lifecycle_status: string }[]>`
      select id::text as id, full_name, lifecycle_status::text as lifecycle_status
      from athletes
      where coach_id = ${coach_id} and lifecycle_status <> 'baja'
      order by full_name
    `,
    client<{ athlete_id: string; test_id: string; last_done: string }[]>`
      select wa.athlete_id::text          as athlete_id,
             wa.calibration_test_id::text as test_id,
             max(wa.scheduled_for)::text  as last_done
      from workout_assignments wa
      join athletes a on a.id = wa.athlete_id
      where a.coach_id = ${coach_id}
        and wa.calibration_test_id is not null
        and wa.status = 'completed'
      group by wa.athlete_id, wa.calibration_test_id
    `,
  ]);

  const byAthlete = new Map<string, Record<string, string>>();
  for (const h of history) {
    const rec = byAthlete.get(h.athlete_id) ?? {};
    rec[h.test_id] = h.last_done;
    byAthlete.set(h.athlete_id, rec);
  }

  return athletes.map((a) => ({
    athlete_id: a.id,
    full_name: a.full_name,
    lifecycle_status: a.lifecycle_status,
    last_done_by_test: byAthlete.get(a.id) ?? {},
  }));
}
