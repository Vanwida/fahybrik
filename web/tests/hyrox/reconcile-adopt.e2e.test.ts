// Real-DB e2e for the race auto-result / reconcile flow. Runs only when
// TEST_DATABASE_URL points at a Neon branch with the full schema (>= 0081);
// SKIPPED loudly otherwise (never a false green). Covers:
//   (d) planned → completed on the SAME row (the adopt seam, no duplicate)
//   (b) a doubles result adopting a singles target for the same event/date
//   (#5) adopt hitting the (athlete_id, source_idp) unique idx → MERGE, not a
//        swallowed violation + lingering duplicate
//   (c) the cron give-up guard: only IN-BOUNDS targets are chased (capped /
//       out-of-window targets are not re-scraped forever)

import { afterAll, afterEach, beforeEach, expect, it } from 'vitest';
import { describeWithDb, getTestSql, closeTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';
import {
  adoptPendingRaceForImport,
  reconcileAndUpsertRace,
  type ImportedResultKey,
} from '@/lib/hyrox/reconcile';
import type { RaceUpsertRow } from '@/lib/hyrox/upsert';
import {
  runAutoImportResults,
  MAX_AUTO_IMPORT_ATTEMPTS,
} from '@/lib/cron/auto-import-results';
import type { Sql } from '@/lib/db';

const sql = getTestSql();

// A fixed, far-past completed result. race_date is in the past so it can adopt a
// passed pending target (a future objective can't be adopted by a past result).
const RESULT_DATE = '2026-03-14';

function importedKey(over: Partial<ImportedResultKey & { source_idp: string }> = {}) {
  return {
    event_id: null,
    race_date: RESULT_DATE,
    event_type: 'hyrox',
    format: 'singles',
    division: 'open',
    gender_category: 'men',
    source_idp: 'idp-e2e',
    ...over,
  };
}

function importRow(athleteId: number, over: Partial<RaceUpsertRow> = {}): RaceUpsertRow {
  return {
    athlete_id: athleteId,
    name: 'HYROX E2E',
    event_type: 'hyrox',
    format: 'singles',
    division: 'open',
    gender_category: 'men',
    priority: 'tune_up',
    age_group: null,
    race_date: RESULT_DATE,
    location: 'E2E City',
    result_time_seconds: 3600,
    status: 'completed',
    run_splits: [],
    station_splits: [],
    roxzone_seconds: null,
    run_total_seconds: null,
    best_run_lap_seconds: null,
    overall_rank: null,
    age_group_rank: null,
    field_size: null,
    nationality: null,
    bib: null,
    source: 'hyresult_import',
    source_idp: 'idp-e2e',
    source_event: null,
    source_season: null,
    source_url: null,
    ...over,
  };
}

/** Insert a pending FUTURE objective (a coach target) and return its id. */
async function insertTarget(
  client: Sql,
  athleteId: number,
  over: { format?: string; race_date?: string; priority?: string; goal?: number | null } = {},
): Promise<number> {
  const rows = await client<{ id: number }[]>`
    insert into races (
      athlete_id, name, event_type, format, division, gender_category,
      priority, race_date, status, goal_time_seconds, source
    ) values (
      ${athleteId}, 'Target', 'hyrox', ${over.format ?? 'singles'}::race_format,
      'open'::race_division, 'men'::race_gender,
      ${over.priority ?? 'target'}::race_priority, ${over.race_date ?? RESULT_DATE}::date,
      'planned'::race_status, ${over.goal ?? null}, 'manual'
    )
    returning id::int as id
  `;
  return rows[0]!.id;
}

async function countAthleteRaces(client: Sql, athleteId: number): Promise<number> {
  const r = await client<{ n: number }[]>`
    select count(*)::int as n from races where athlete_id = ${athleteId}
  `;
  return r[0]!.n;
}

describeWithDb('race reconcile/adopt — real DB', () => {
  let fx: Fixture;

  beforeEach(async () => {
    fx = await makeCoachAndAthlete(sql);
  });
  afterEach(async () => {
    await fx.cleanup();
  });
  afterAll(async () => {
    await closeTestSql();
  });

  it('(d) planned target → completed on the SAME row (no duplicate), keeps coach role', async () => {
    await insertTarget(sql, fx.athleteId, { goal: 3300 });

    const res = await sql.begin((tx) =>
      reconcileAndUpsertRace(tx, {
        athlete_id: fx.athleteId,
        imported: importedKey(),
        row: importRow(fx.athleteId),
      }),
    );

    expect(res.adopt.outcome).toBe('adopted');
    expect(await countAthleteRaces(sql, fx.athleteId)).toBe(1); // no dup
    const row = (
      await sql<{ status: string; priority: string; result_time_seconds: number; goal_time_seconds: number | null }[]>`
        select status::text, priority::text, result_time_seconds, goal_time_seconds
        from races where athlete_id = ${fx.athleteId}
      `
    )[0]!;
    expect(row.status).toBe('completed'); // filled by the upsert
    expect(row.result_time_seconds).toBe(3600);
    expect(row.priority).toBe('target'); // coach role survived
    expect(row.goal_time_seconds).toBe(3300); // coach goal survived
  });

  it('(b) a DOUBLES result adopts a SINGLES target for the same event/date', async () => {
    await insertTarget(sql, fx.athleteId, { format: 'singles' });

    const res = await sql.begin((tx) =>
      reconcileAndUpsertRace(tx, {
        athlete_id: fx.athleteId,
        imported: importedKey({ format: 'doubles' }),
        row: importRow(fx.athleteId, { format: 'doubles' }),
      }),
    );

    expect(res.adopt.outcome).toBe('adopted');
    expect(await countAthleteRaces(sql, fx.athleteId)).toBe(1); // adopted, no dup
    const row = (
      await sql<{ format: string; priority: string }[]>`
        select format::text, priority::text from races where athlete_id = ${fx.athleteId}
      `
    )[0]!;
    expect(row.format).toBe('doubles'); // result refreshed the format
    expect(row.priority).toBe('target');
  });

  it('(#5) adopt that would hit the source_idp unique idx MERGES instead of swallowing', async () => {
    // A completed row already holds (athlete_id, source_idp) — e.g. a prior import
    // already landed it as a tune-up. THEN a pending target for the same race
    // exists. Adopting would stamp the same source_idp onto the target → unique
    // violation. The fix detects it and merges the target's role onto the
    // completed row, deleting the target.
    await sql`
      insert into races (
        athlete_id, name, event_type, format, division, gender_category,
        priority, race_date, status, result_time_seconds, source, source_idp
      ) values (
        ${fx.athleteId}, 'Completed', 'hyrox', 'singles'::race_format, 'open'::race_division,
        'men'::race_gender, 'tune_up'::race_priority, ${RESULT_DATE}::date, 'completed'::race_status,
        3600, 'hyresult_import', 'idp-merge'
      )
    `;
    await insertTarget(sql, fx.athleteId, { goal: 3200 });
    expect(await countAthleteRaces(sql, fx.athleteId)).toBe(2);

    const out = await adoptPendingRaceForImport({
      athlete_id: fx.athleteId,
      imported: importedKey({ source_idp: 'idp-merge' }),
      client: sql,
    });

    expect(out.outcome).toBe('merged');
    expect(await countAthleteRaces(sql, fx.athleteId)).toBe(1); // target removed, no dup
    const row = (
      await sql<{ priority: string; goal_time_seconds: number | null; source_idp: string }[]>`
        select priority::text, goal_time_seconds, source_idp from races where athlete_id = ${fx.athleteId}
      `
    )[0]!;
    expect(row.source_idp).toBe('idp-merge'); // the completed row, kept
    expect(row.priority).toBe('target'); // merged coach role
    expect(row.goal_time_seconds).toBe(3200); // merged coach goal
  });

  it('(c) cron give-up: only IN-BOUNDS targets are chased; capped & out-of-window are skipped', async () => {
    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const daysAgo = (n: number) => {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - n);
      return iso(d);
    };

    // Three athletes, each with a slug + one passed target in a distinct state.
    const a1 = await makeCoachAndAthlete(sql); // due: recent, attempts 0
    const a2 = await makeCoachAndAthlete(sql); // capped: recent but attempts == MAX
    const a3 = await makeCoachAndAthlete(sql); // out of window: very old
    try {
      await sql`update athletes set hyresult_slug = ${'slug-a1'} where id = ${a1.athleteId}`;
      await sql`update athletes set hyresult_slug = ${'slug-a2'} where id = ${a2.athleteId}`;
      await sql`update athletes set hyresult_slug = ${'slug-a3'} where id = ${a3.athleteId}`;

      const t1 = await insertTarget(sql, a1.athleteId, { race_date: daysAgo(14) });
      await insertTarget(sql, a2.athleteId, { race_date: daysAgo(14) });
      await insertTarget(sql, a3.athleteId, { race_date: daysAgo(200) });
      await sql`update races set auto_import_attempts = ${MAX_AUTO_IMPORT_ATTEMPTS} where athlete_id = ${a2.athleteId}`;

      const called: number[] = [];
      const fakeImport = (async (p: { athlete_id: number; slug: string }) => {
        called.push(p.athlete_id);
        return { imported: 0, updated: 0, races: [] };
      }) as unknown as typeof import('@/lib/hyrox/hyresult').importAllRaces;

      await runAutoImportResults({ client: sql, importRaces: fakeImport });

      // a1 chased; a2 (capped) and a3 (out of window) NOT chased — no infinite re-scrape.
      expect(called).toContain(a1.athleteId);
      expect(called).not.toContain(a2.athleteId);
      expect(called).not.toContain(a3.athleteId);

      // a1's still-unmatched target accrued one attempt (the give-up counter advances).
      const att = (
        await sql<{ n: number }[]>`select auto_import_attempts as n from races where id = ${t1}`
      )[0]!.n;
      expect(att).toBe(1);
    } finally {
      await a1.cleanup();
      await a2.cleanup();
      await a3.cleanup();
    }
  }, 30_000); // serial Neon connection + 3 extra fixtures → generous timeout
});
