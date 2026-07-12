// #58 — structured post-workout feedback (perceived_difficulty + pain area/note).
//
// Real-DB round-trip: the shared recorder persists the three columns; the coach
// surfaces (activity glance) + the attention rollup CTE read them back; the DB
// CHECK constraint rejects an out-of-set value. Types are pinned.

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { recordWorkoutExecution } from '@/lib/sync/record-workout-execution';
import { loadActivityToday } from '@/lib/dashboard/coach/activity-today';
import { loadBatch } from '@/lib/coach/attention/recompute-batch';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate } from '../utils/db-fixtures';

describeWithDb('execution feedback (real DB)', () => {
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

  test('recorder persists perceived_difficulty + pain fields, coach surfaces read them', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const tpl = await makeTemplate({ fx, name: 'Sesión test' });
    const assignmentId = await makeAssignment({
      fx,
      templateId: tpl,
      scheduledForIso: new Date().toISOString().slice(0, 10),
    });

    const res = await recordWorkoutExecution({
      athleteId: fx.athleteId,
      assignmentId,
      input: {
        perceived_exertion: 8,
        perceived_difficulty: 'too_hard',
        pain_area: 'rodilla',
        pain_note: 'pinchazo al bajar',
      },
      sql,
    });
    expect(res.ok).toBe(true);

    // Column round-trip (values + types).
    const rows = await sql<
      Array<{ perceived_difficulty: string | null; pain_area: string | null; pain_note: string | null }>
    >`
      select perceived_difficulty, pain_area, pain_note
      from workout_executions where assignment_id = ${assignmentId} limit 1
    `;
    expect(rows[0]).toMatchObject({
      perceived_difficulty: 'too_hard',
      pain_area: 'rodilla',
      pain_note: 'pinchazo al bajar',
    });

    // Coach activity glance surfaces the structured feedback.
    const activity = await loadActivityToday({ coach_id: fx.coachId, client: sql });
    const mine = activity.sessions.find((s) => s.athlete_id === String(fx.athleteId));
    expect(mine).toBeDefined();
    expect(mine!.perceived_difficulty).toBe('too_hard');
    expect(mine!.pain_area).toBe('rodilla');

    // Attention rollup CTE surfaces the discomfort fact for the evaluator.
    const batch = await loadBatch(sql, fx.coachId, new Date(), fx.athleteId);
    const brow = batch.find((b) => b.athlete_id === String(fx.athleteId));
    expect(brow).toBeDefined();
    expect(brow!.latest_pain_area).toBe('rodilla');
    expect(brow!.latest_pain_at).toBeInstanceOf(Date);
  });

  test('DB CHECK rejects a pain_area outside the closed set', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const tpl = await makeTemplate({ fx, name: 'Sesión test' });
    const assignmentId = await makeAssignment({
      fx,
      templateId: tpl,
      scheduledForIso: new Date().toISOString().slice(0, 10),
    });
    await expect(
      sql`
        insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, source, pain_area)
        values (${assignmentId}, ${fx.athleteId}, now(), now(), 'healthkit', 'cerebro')
      `,
    ).rejects.toThrow();
  });
});
