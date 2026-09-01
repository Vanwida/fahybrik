// Regression coverage for `recordWorkoutExecution` — the shared save path behind
// POST /api/sync/workout-execution (solo) AND the Dobles joint log. Until this
// file there was NO test at all for this save, and that is exactly how a wrong
// `ON CONFLICT (assignment_id)` lived in production for a week: migration 0191
// narrowed `workout_executions_assignment_unique` to a PARTIAL index (`where
// assignment_id is not null`) so it could allow imported executions with no
// assignment, but the writer's `insert ... on conflict (assignment_id) do update`
// was never updated to match — Postgres requires the ON CONFLICT target to
// mirror the arbiter index's predicate exactly, so it stopped finding ANY
// matching index and every single save (fuerza, carrera, EMOM, todas) started
// failing with 42P10 ("there is no unique or exclusion constraint matching the
// ON CONFLICT specification"). Fixed by migration 0203, which returns the index
// to a PLAIN unique(assignment_id) — Postgres never treats two NULLs as equal
// for uniqueness, so the partial predicate was never needed for the imported
// case it was added for (test below proves it).
//
// Verified RED and GREEN before landing: on a throwaway Neon branch the file goes
// 5/5 green; re-creating 0191's PARTIAL index by hand drops 4 of the 5 with that
// exact 42P10, and restoring the plain index turns them green again. The one that
// stays green either way is the no-assignment case — it never touches the broken
// ON CONFLICT, which is precisely why the bug went unseen.
//
// Runs against a real DB only: `describeWithDb` skips the file unless
// TEST_DATABASE_URL points at a throwaway branch. Never production.

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { recordWorkoutExecution } from '@/lib/sync/record-workout-execution';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

interface ExecutionRow {
  id: string;
  assignment_id: string | null;
  athlete_id: string;
  perceived_exertion: number | null;
}

interface AssignmentStatusRow {
  status: string;
}

describeWithDb('recordWorkoutExecution (workout_executions save, real DB)', () => {
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

  async function seed(): Promise<{ fx: Fixture; assignmentId: number }> {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const tpl = await makeTemplate({ fx, name: 'Fuerza + trineos' });
    const assignmentId = await makeAssignment({
      fx,
      templateId: tpl,
      scheduledForIso: new Date().toISOString().slice(0, 10),
    });
    return { fx, assignmentId };
  }

  const readExecution = (assignmentId: number) => sql<ExecutionRow[]>`
    select id::text, assignment_id::text, athlete_id::text, perceived_exertion
    from workout_executions
    where assignment_id = ${assignmentId}
  `;

  const readAssignmentStatus = (assignmentId: number) => sql<AssignmentStatusRow[]>`
    select status::text as status from workout_assignments where id = ${assignmentId}
  `;

  // ── 1) The core save — the exact statement that 42P10'd for a week ──────────
  test('saving an execution for a real assignment leaves a row and marks it completed', async () => {
    const { fx, assignmentId } = await seed();

    const res = await recordWorkoutExecution({
      athleteId: fx.athleteId,
      assignmentId,
      input: { perceived_exertion: 10, total_duration_seconds: 2822, completeness: 'full' },
      sql,
    });

    expect(res.ok).toBe(true);
    const rows = await readExecution(assignmentId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.athlete_id).toBe(String(fx.athleteId));

    const [status] = await readAssignmentStatus(assignmentId);
    expect(status!.status).toBe('completed');
  });

  // ── 2) Retry / re-sync — upsert, never a duplicate ───────────────────────────
  test('resyncing the same assignment updates the row instead of duplicating it', async () => {
    const { fx, assignmentId } = await seed();

    const first = await recordWorkoutExecution({
      athleteId: fx.athleteId,
      assignmentId,
      input: { perceived_exertion: 7 },
      sql,
    });
    expect(first.ok).toBe(true);

    // A retried sync — same assignment, a different RPE (the athlete corrected it).
    const second = await recordWorkoutExecution({
      athleteId: fx.athleteId,
      assignmentId,
      input: { perceived_exertion: 10 },
      sql,
    });
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.execution_id).toBe(first.execution_id); // same row, not a new one
    }

    const rows = await readExecution(assignmentId);
    expect(rows).toHaveLength(1); // one execution per assignment, never two
    expect(rows[0]!.perceived_exertion).toBe(10); // the retry's value won
  });

  // ── 3) Honest completeness — 'partial' must never read as 'completed' ───────
  test('completeness "partial" leaves the assignment partial, not completed', async () => {
    const { fx, assignmentId } = await seed();

    const res = await recordWorkoutExecution({
      athleteId: fx.athleteId,
      assignmentId,
      input: { perceived_exertion: 9, completeness: 'partial' },
      sql,
    });
    expect(res.ok).toBe(true);

    const [status] = await readAssignmentStatus(assignmentId);
    expect(status!.status).toBe('partial');
  });

  // ── 4) Imported executions with NO assignment (the 0191 case) ───────────────
  // `recordWorkoutExecution` always requires a real, owned assignment (it 404s
  // otherwise), so this exercises the same INSERT shape the HealthKit/Garmin/
  // Polar importers use directly: assignment_id explicitly NULL. Two such rows
  // for the same athlete must coexist — proving the fix (a PLAIN unique index)
  // is enough, and that 0191's partial predicate was solving a problem Postgres
  // doesn't have (two NULLs never collide under a unique constraint).
  test('two imported executions with no assignment coexist without colliding', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);

    const insertImported = () => sql<Array<{ id: string }>>`
      insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, source)
      values (null, ${fx.athleteId}, now(), now(), 'healthkit'::biometric_source)
      returning id::text
    `;

    const first = await insertImported();
    const second = await insertImported();
    expect(first[0]!.id).not.toBe(second[0]!.id);

    const rows = await sql<Array<{ id: string }>>`
      select id::text from workout_executions
      where athlete_id = ${fx.athleteId} and assignment_id is null
    `;
    expect(rows).toHaveLength(2);
  });

  // ── 5) Per-segment actuals — upsert by (execution_id, position, round_index) ──
  test('segments land in segment_executions and a resync does not duplicate them', async () => {
    const { fx, assignmentId } = await seed();

    const input = {
      perceived_exertion: 10,
      segments: [
        { position: 0, modality: 'run', duration_seconds: 360, avg_hr: 128, max_hr: 145 },
        { position: 1, modality: 'strength', duration_seconds: 669, weight_used_kg: 100, reps_completed: 15 },
      ],
    };

    const first = await recordWorkoutExecution({ athleteId: fx.athleteId, assignmentId, input, sql });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.segments_saved).toBe(2);

    const afterFirst = await sql<Array<{ position: number }>>`
      select position from segment_executions where execution_id = ${Number(first.execution_id)} order by position
    `;
    expect(afterFirst.map((r) => r.position)).toEqual([0, 1]);

    // Re-sync — same positions, same execution. Must UPSERT, not insert again.
    const second = await recordWorkoutExecution({ athleteId: fx.athleteId, assignmentId, input, sql });
    expect(second.ok).toBe(true);

    const afterSecond = await sql<Array<{ id: string }>>`
      select id::text from segment_executions where execution_id = ${Number(first.execution_id)}
    `;
    expect(afterSecond).toHaveLength(2); // still two rows, never four
  });
});
