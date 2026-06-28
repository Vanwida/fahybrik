/**
 * Real-DB integration test for the GET /api/athlete/races readers:
 *   getUpcomingRaces (lib/races/next-race.ts) and
 *   listAthletePastRaces (lib/races/athlete-races.ts).
 *
 * Verifies the upcoming/past SPLIT and ORDERING against real Postgres rows —
 * nothing mocked. Dates are anchored to the SAME "today in box" the readers use
 * (Europe/Madrid), so days_until is deterministic. Races cascade-delete with the
 * athlete (races.athlete_id ON DELETE CASCADE), so fx.cleanup is sufficient.
 *
 * The key edge: a FUTURE-dated row that already has a result must drop to `past`
 * (and never appear in `upcoming`) — driven purely by `result_time_seconds`, not
 * by status.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { isoDateString, startOfDayInBox } from '@fahybrid/shared/domain/dates';
import { getUpcomingRaces } from '@/lib/races/next-race';
import { listAthletePastRaces } from '@/lib/races/athlete-races';
import { promoteRaceToTarget } from '@/lib/races/target-race-write';
import type { RacePriority } from '@fahybrid/shared/schema';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

// Calendar-day offset on a 'YYYY-MM-DD' string via UTC math (no tz drift).
function addDaysIso(baseIso: string, days: number): string {
  const d = new Date(`${baseIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describeWithDb('athlete races split (real DB)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];

  // "today" exactly as the readers compute it (box tz), so days_until is exact.
  const todayIso = isoDateString(startOfDayInBox(new Date()));

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
  });
  afterAll(async () => {
    await closeTestSql();
  });

  async function insertRace(params: {
    athleteId: number;
    name: string;
    raceDateIso: string | null;
    status: 'planned' | 'registered' | 'completed';
    resultSeconds: number | null;
    priority?: RacePriority;
  }): Promise<number> {
    const rows = await sql<Array<{ id: string }>>`
      insert into races
        (athlete_id, name, event_type, format, division, gender_category,
         priority, race_date, status, result_time_seconds)
      values
        (${params.athleteId}, ${params.name}, 'hyrox', 'singles', 'open', 'men',
         ${params.priority ?? 'target'}, ${params.raceDateIso}, ${params.status},
         ${params.resultSeconds})
      returning id::text
    `;
    return Number(rows[0]!.id);
  }

  async function prioritiesById(athleteId: number): Promise<Record<string, string>> {
    const rows = await sql<Array<{ id: string; priority: string }>>`
      select id::text as id, priority::text as priority
      from races where athlete_id = ${athleteId}
    `;
    return Object.fromEntries(rows.map((r) => [r.id, r.priority]));
  }

  test('splits upcoming vs past and orders each bucket', async () => {
    const fx: Fixture = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);

    // Two upcoming objectives (no result), out of date order on insert to prove
    // the query sorts (ASC date), not insert order.
    const upB = await insertRace({
      athleteId: fx.athleteId, name: 'Upcoming B (+40)',
      raceDateIso: addDaysIso(todayIso, 40), status: 'planned', resultSeconds: null,
    });
    const upA = await insertRace({
      athleteId: fx.athleteId, name: 'Upcoming A (+10)',
      raceDateIso: addDaysIso(todayIso, 10), status: 'registered', resultSeconds: null,
    });
    // Future-dated BUT already has a result → belongs to `past`, never upcoming.
    // status stays 'registered' so ONLY the result filter excludes it.
    const futResult = await insertRace({
      athleteId: fx.athleteId, name: 'Future w/ result (+20)',
      raceDateIso: addDaysIso(todayIso, 20), status: 'registered', resultSeconds: 3600,
    });
    // Expired objective: past date, no result → `past`.
    const expired = await insertRace({
      athleteId: fx.athleteId, name: 'Expired (-15)',
      raceDateIso: addDaysIso(todayIso, -15), status: 'registered', resultSeconds: null,
    });
    // Old logged result → `past`.
    const pastResult = await insertRace({
      athleteId: fx.athleteId, name: 'Past w/ result (-60)',
      raceDateIso: addDaysIso(todayIso, -60), status: 'completed', resultSeconds: 4000,
    });

    const upcoming = await getUpcomingRaces(fx.athleteId, sql);
    const past = await listAthletePastRaces(fx.athleteId, sql);

    // ── upcoming: exactly the two future no-result rows, ASC by date ──────────
    expect(upcoming.map((r) => r.race_id)).toEqual([upA, upB]);
    expect(upcoming.map((r) => r.days_until)).toEqual([10, 40]);
    expect(upcoming.every((r) => r.event_id === null)).toBe(true);

    // ── past: the three "happened" rows, DESC by date (id desc on ties) ───────
    expect(past.map((r) => r.race_id)).toEqual([futResult, expired, pastResult]);

    // ── the split is clean: no row appears in both buckets ───────────────────
    const upIds = new Set(upcoming.map((r) => r.race_id));
    expect(past.some((r) => upIds.has(r.race_id))).toBe(false);
    // The key edge: a future row with a result is NOT upcoming.
    expect(upIds.has(futResult)).toBe(false);

    // Expired objective carries through with no result (not all past rows have one).
    const expiredRow = past.find((r) => r.race_id === expired);
    expect(expiredRow?.result_time_seconds).toBeNull();
  });

  test('promoteRaceToTarget makes one primary, demotes the prior, keeps tune-ups', async () => {
    const fx: Fixture = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);

    // The current primary (+30), a secondary sooner (+10), a tune-up (+5), and an
    // old completed result (-30). Athlete wants to promote the secondary.
    const target = await insertRace({
      athleteId: fx.athleteId, name: 'Target (+30)',
      raceDateIso: addDaysIso(todayIso, 30), status: 'planned', resultSeconds: null,
      priority: 'target',
    });
    const secondary = await insertRace({
      athleteId: fx.athleteId, name: 'Secondary (+10)',
      raceDateIso: addDaysIso(todayIso, 10), status: 'registered', resultSeconds: null,
      priority: 'secondary',
    });
    const tuneUp = await insertRace({
      athleteId: fx.athleteId, name: 'Tune-up (+5)',
      raceDateIso: addDaysIso(todayIso, 5), status: 'planned', resultSeconds: null,
      priority: 'tune_up',
    });
    const completed = await insertRace({
      athleteId: fx.athleteId, name: 'Completed (-30)',
      raceDateIso: addDaysIso(todayIso, -30), status: 'completed', resultSeconds: 4000,
      priority: 'secondary',
    });

    // Promote the secondary → it becomes the single primary.
    const res = await promoteRaceToTarget({
      athlete_id: fx.athleteId, race_id: secondary, client: sql,
    });
    expect(res).not.toBeNull();
    expect(res!.race_id).toBe(String(secondary));
    // The canonical countdown reader now points at the promoted race.
    expect(res!.target_race?.name).toBe('Secondary (+10)');

    const after = await prioritiesById(fx.athleteId);
    expect(after[String(secondary)]).toBe('target');   // promoted
    expect(after[String(target)]).toBe('secondary');   // prior primary stepped down
    expect(after[String(tuneUp)]).toBe('tune_up');     // tune-up preserved, not clobbered
    expect(after[String(completed)]).toBe('secondary'); // completed result untouched

    // Exactly one 'target' among the live (planned/registered) objectives.
    const liveTargets = await sql<Array<{ id: string }>>`
      select id::text as id from races
      where athlete_id = ${fx.athleteId}
        and priority = 'target'
        and status in ('planned', 'registered')
    `;
    expect(liveTargets.map((r) => r.id)).toEqual([String(secondary)]);

    // A completed result can't be promoted (no live future objective) → null.
    expect(
      await promoteRaceToTarget({ athlete_id: fx.athleteId, race_id: completed, client: sql }),
    ).toBeNull();

    // A race the athlete doesn't own (here: a non-existent id) → null, no writes.
    expect(
      await promoteRaceToTarget({ athlete_id: fx.athleteId, race_id: 999_999_999, client: sql }),
    ).toBeNull();
    // The ghost-promote left the winner intact.
    const stillTarget = await prioritiesById(fx.athleteId);
    expect(stillTarget[String(secondary)]).toBe('target');
  });
});
