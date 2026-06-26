/**
 * Real-DB integration tests for the SEQUENCE WALK (advanceSequenceForAthlete).
 *
 * Exercises the actual cursor advance + end-policy resolution against a real Neon
 * branch: a 2-item sequence is enrolled at position 1, its first microciclo is
 * materialized and marked finished, then advanceSequenceForAthlete is called to:
 *   1. advance to position 2 (materializing the next microciclo), and
 *   2. resolve the LAST-item end-policy (repeat → cursor back to 1; stop → completed).
 *
 * No SQL is mocked. Every assertion re-queries the branch. Each test creates its
 * own coach/athlete/sequence and tears everything down (incl. 0059/0060 rows the
 * shared fixture predates), so the DB is left exactly as found.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';

// Real-DB materializing calls (instantiate + reads back) exceed the 5s default on a
// cold Neon branch endpoint. 30s headroom per test; these suites aren't throughput-bound.
const DB_TEST_TIMEOUT_MS = 30_000;
import { advanceSequenceForAthlete } from '@/lib/dashboard/coach/assign-sequence';
import { instantiateMonthFromTemplate } from '@/lib/dashboard/coach/instantiate-program';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeCoachAndAthlete,
  makeMonthTemplate,
  makeTemplate,
  type Fixture,
} from '../utils/db-fixtures';

describeWithDb('advanceSequenceForAthlete (real DB)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });

  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
  });

  afterAll(async () => {
    await closeTestSql();
  });

  // ---- helpers (sequence rows the shared fixture predates) -------------------

  async function makeLevel(fx: Fixture, name: string, sortOrder: number): Promise<number> {
    const rows = await sql<{ id: string }[]>`
      insert into athlete_levels (coach_id, name, label, sort_order)
      values (${fx.coachId}, ${name}, ${name}, ${sortOrder})
      returning id::text
    `;
    const id = Number(rows[0]!.id);
    cleanups.push(async () => {
      await sql`delete from athlete_levels where id = ${id}`;
    });
    return id;
  }

  async function makeSequence(params: {
    fx: Fixture;
    levelId: number;
    days: number;
    endPolicy: 'repeat' | 'level_up' | 'stop';
    monthTemplateIds: number[];
  }): Promise<number> {
    const { fx, levelId, days, endPolicy, monthTemplateIds } = params;
    const rows = await sql<{ id: string }[]>`
      insert into program_sequences (coach_id, level_id, days_per_week, end_policy)
      values (${fx.coachId}, ${levelId}, ${days}, ${endPolicy})
      returning id::text
    `;
    const seqId = Number(rows[0]!.id);
    for (let i = 0; i < monthTemplateIds.length; i++) {
      await sql`
        insert into program_sequence_items (sequence_id, position, month_template_id)
        values (${seqId}, ${i + 1}, ${monthTemplateIds[i]})
      `;
    }
    cleanups.push(async () => {
      await sql`delete from athlete_sequence_progress where sequence_id = ${seqId}`;
      await sql`delete from program_sequence_items where sequence_id = ${seqId}`;
      await sql`delete from program_sequences where id = ${seqId}`;
    });
    return seqId;
  }

  async function enroll(fx: Fixture, sequenceId: number, position: number): Promise<number> {
    const rows = await sql<{ id: string }[]>`
      insert into athlete_sequence_progress (athlete_id, coach_id, sequence_id, current_position, status)
      values (${fx.athleteId}, ${fx.coachId}, ${sequenceId}, ${position}, 'active')
      returning id::text
    `;
    return Number(rows[0]!.id);
  }

  /**
   * Materialize a month template for the athlete and BACKDATE its receipt window
   * into the past so isCurrentMicrocicloFinished() returns true (time-done).
   */
  async function materializeFinished(fx: Fixture, monthTemplateId: number): Promise<void> {
    // A macrocycle/block covering the past window the materializer will use.
    await instantiateMonthFromTemplate({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: monthTemplateId,
      start_date: '2026-01-05', // a Monday, fully in the past
      client: sql,
    });
    // Force the receipt window into the past (defensive — the start above already
    // is, but pin it so the FINISHED gate is unambiguous regardless of weekCount).
    await sql`
      update athlete_month_assignments
      set end_date = '2026-02-01'::date
      where athlete_id = ${fx.athleteId} and month_template_id = ${monthTemplateId}
    `;
  }

  async function cursorOf(progressId: number): Promise<{ position: number; status: string } | null> {
    const rows = await sql<{ current_position: number; status: string }[]>`
      select current_position, status from athlete_sequence_progress where id = ${progressId}
    `;
    const r = rows[0];
    return r ? { position: r.current_position, status: r.status } : null;
  }

  async function countMaterialized(fx: Fixture, monthTemplateId: number): Promise<number> {
    const rows = await sql<{ n: number }[]>`
      select count(*)::int as n from athlete_month_assignments
      where athlete_id = ${fx.athleteId} and month_template_id = ${monthTemplateId}
    `;
    return rows[0]?.n ?? 0;
  }

  // ---- tests -----------------------------------------------------------------

  test('mid-sequence: advances to position 2 and materializes the next microciclo', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const levelId = await makeLevel(fx, 'TST-N1', 1);
    const tplId = await makeTemplate({ fx, name: 'walk circuit' });
    const m1 = await makeMonthTemplate({ fx, weekCount: 1, workoutDays: [1, 3], workoutTemplateId: tplId });
    const m2 = await makeMonthTemplate({ fx, weekCount: 1, workoutDays: [2, 4], workoutTemplateId: tplId });
    const seqId = await makeSequence({
      fx, levelId, days: 4, endPolicy: 'stop', monthTemplateIds: [m1.monthId, m2.monthId],
    });
    const progressId = await enroll(fx, seqId, 1);

    // Position-1 microciclo materialized + finished (past window).
    await materializeFinished(fx, m1.monthId);
    expect(await countMaterialized(fx, m2.monthId)).toBe(0);

    const result = await advanceSequenceForAthlete(fx.athleteId, fx.coachId, sql);

    expect(result.outcome).toBe('advanced');
    expect(result.position).toBe(2);
    expect(result.materialized_month_template_id).toBe(m2.monthId);
    // The position-2 microciclo is now materialized.
    expect(await countMaterialized(fx, m2.monthId)).toBeGreaterThan(0);
    // Cursor advanced.
    expect(await cursorOf(progressId)).toEqual({ position: 2, status: 'active' });
  }, DB_TEST_TIMEOUT_MS);


  test('not finished: no-op when the current microciclo is still in the future', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const levelId = await makeLevel(fx, 'TST-N1', 1);
    const tplId = await makeTemplate({ fx, name: 'walk circuit' });
    const m1 = await makeMonthTemplate({ fx, weekCount: 1, workoutDays: [1], workoutTemplateId: tplId });
    const m2 = await makeMonthTemplate({ fx, weekCount: 1, workoutDays: [2], workoutTemplateId: tplId });
    const seqId = await makeSequence({
      fx, levelId, days: 4, endPolicy: 'stop', monthTemplateIds: [m1.monthId, m2.monthId],
    });
    const progressId = await enroll(fx, seqId, 1);
    // No materialization at all → nothing to finish → must NOT advance.

    const result = await advanceSequenceForAthlete(fx.athleteId, fx.coachId, sql);

    expect(result.outcome).toBe('not_yet_finished');
    expect(await cursorOf(progressId)).toEqual({ position: 1, status: 'active' });
    expect(await countMaterialized(fx, m2.monthId)).toBe(0);
  }, DB_TEST_TIMEOUT_MS);


  test('end-policy stop: last item → enrollment completed, no new materialization', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const levelId = await makeLevel(fx, 'TST-N1', 1);
    const tplId = await makeTemplate({ fx, name: 'walk circuit' });
    const m1 = await makeMonthTemplate({ fx, weekCount: 1, workoutDays: [1], workoutTemplateId: tplId });
    const seqId = await makeSequence({
      fx, levelId, days: 4, endPolicy: 'stop', monthTemplateIds: [m1.monthId],
    });
    const progressId = await enroll(fx, seqId, 1); // position 1 IS the last item
    await materializeFinished(fx, m1.monthId);
    const before = await countMaterialized(fx, m1.monthId);

    const result = await advanceSequenceForAthlete(fx.athleteId, fx.coachId, sql);

    expect(result.outcome).toBe('stopped');
    expect(await cursorOf(progressId)).toEqual({ position: 1, status: 'completed' });
    // No new microciclo materialized (still just the original receipt).
    expect(await countMaterialized(fx, m1.monthId)).toBe(before);
  }, DB_TEST_TIMEOUT_MS);


  test('end-policy repeat: last item → cursor back to 1, loop re-materialized', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const levelId = await makeLevel(fx, 'TST-N1', 1);
    const tplId = await makeTemplate({ fx, name: 'walk circuit' });
    const m1 = await makeMonthTemplate({ fx, weekCount: 1, workoutDays: [1], workoutTemplateId: tplId });
    const seqId = await makeSequence({
      fx, levelId, days: 4, endPolicy: 'repeat', monthTemplateIds: [m1.monthId],
    });
    const progressId = await enroll(fx, seqId, 1);
    await materializeFinished(fx, m1.monthId);
    const before = await countMaterialized(fx, m1.monthId);

    const result = await advanceSequenceForAthlete(fx.athleteId, fx.coachId, sql);

    expect(result.outcome).toBe('looped');
    expect(result.position).toBe(1);
    expect(await cursorOf(progressId)).toEqual({ position: 1, status: 'active' });
    // The first microciclo was materialized AGAIN (a fresh loop).
    expect(await countMaterialized(fx, m1.monthId)).toBe(before + 1);
  }, DB_TEST_TIMEOUT_MS);


  test('end-policy level_up: promotes to next level, new enrollment, athlete level updated', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const l1 = await makeLevel(fx, 'TST-N1', 1);
    const l2 = await makeLevel(fx, 'TST-N2', 2);
    // Set the athlete to level 1 so resolveLevelUp anchors correctly.
    await sql`update athletes set level_id = ${l1}, training_days_per_week = 4 where id = ${fx.athleteId}`;
    const tplId = await makeTemplate({ fx, name: 'walk circuit' });
    const m1 = await makeMonthTemplate({ fx, weekCount: 1, workoutDays: [1], workoutTemplateId: tplId });
    const m2 = await makeMonthTemplate({ fx, weekCount: 1, workoutDays: [2], workoutTemplateId: tplId });
    const seq1 = await makeSequence({ fx, levelId: l1, days: 4, endPolicy: 'level_up', monthTemplateIds: [m1.monthId] });
    const seq2 = await makeSequence({ fx, levelId: l2, days: 4, endPolicy: 'stop', monthTemplateIds: [m2.monthId] });
    const progressId = await enroll(fx, seq1, 1);
    await materializeFinished(fx, m1.monthId);

    const result = await advanceSequenceForAthlete(fx.athleteId, fx.coachId, sql);

    expect(result.outcome).toBe('leveled_up');
    expect(result.sequence_id).toBe(seq2);
    expect(result.materialized_month_template_id).toBe(m2.monthId);
    // Old enrollment completed; a NEW active enrollment exists on seq2 at position 1.
    expect((await cursorOf(progressId))?.status).toBe('completed');
    const active = await sql<{ sequence_id: string; current_position: number }[]>`
      select sequence_id::text, current_position from athlete_sequence_progress
      where athlete_id = ${fx.athleteId} and status = 'active'
    `;
    expect(active).toHaveLength(1);
    expect(Number(active[0]!.sequence_id)).toBe(seq2);
    // Athlete promoted.
    const lvl = await sql<{ level_id: string }[]>`select level_id::text from athletes where id = ${fx.athleteId}`;
    expect(Number(lvl[0]!.level_id)).toBe(l2);
  }, DB_TEST_TIMEOUT_MS);


  test('end-policy level_up fallback: no higher level with a sequence → stop', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const l1 = await makeLevel(fx, 'TST-N1', 1);
    await sql`update athletes set level_id = ${l1}, training_days_per_week = 4 where id = ${fx.athleteId}`;
    const tplId = await makeTemplate({ fx, name: 'walk circuit' });
    const m1 = await makeMonthTemplate({ fx, weekCount: 1, workoutDays: [1], workoutTemplateId: tplId });
    const seq1 = await makeSequence({ fx, levelId: l1, days: 4, endPolicy: 'level_up', monthTemplateIds: [m1.monthId] });
    const progressId = await enroll(fx, seq1, 1);
    await materializeFinished(fx, m1.monthId);

    const result = await advanceSequenceForAthlete(fx.athleteId, fx.coachId, sql);

    // No level above with a sequence → honest fallback to stop.
    expect(result.outcome).toBe('stopped');
    expect((await cursorOf(progressId))?.status).toBe('completed');
  }, DB_TEST_TIMEOUT_MS);
});
