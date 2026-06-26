/**
 * Real-DB integration tests for the LIBRARY-BLOCK materialization path of
 * `instantiateMonthFromTemplate` (Biblioteca de Bloques estructurada, 0038).
 *
 * A week-studio session can carry a part inserted from Pablo's block library:
 * it has `source_block_id` and NO inline items (the content lives as structured
 * `block_exercises`). The materializer must hydrate that part from
 * `block_exercises` → real `template_segments` with the catalog `exercise_id` +
 * canonical params, so the athlete sees exercises + video + analytics.
 *
 * A `needs_review` block (no `block_exercises`) must degrade gracefully: the
 * part contributes no segments (its verbatim still rides on coach_note). No SQL
 * is mocked.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { instantiateMonthFromTemplate } from '@/lib/dashboard/coach/instantiate-program';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeCoachAndAthlete,
  makeExercise,
  makeLibraryBlock,
  makeInlineMonthTemplate,
  type Fixture,
} from '../utils/db-fixtures';

describeWithDb('instantiateMonthFromTemplate — library blocks (real DB)', () => {
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

  async function baseFixture() {
    const fx: Fixture = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    return fx;
  }

  test('hydrates a library-block part into structured segments from block_exercises', async () => {
    const fx = await baseFixture();
    const frontSquat = await makeExercise({ fx, name: 'Front Squat' });
    const hipThrust = await makeExercise({ fx, name: 'Hip Thrust' });

    // Structured block: two sub-blocks (Deadlift-style superset), real params.
    const blockId = await makeLibraryBlock({
      fx,
      title: 'Front squat 5r 10-10-8-8-6 + Hip thrust',
      description: 'Front squat 5r 10/10/8/8/6 al 65-80% + Hip thrust 5r 10/10/8/8/6',
      exercises: [
        {
          exercise_id: frontSquat,
          position: 0,
          block_position: 0,
          params_json: { sets: 5, reps: 10, load_pct: 65, load_pct_range: '65-80' },
          reps_scheme: '10/10/8/8/6',
        },
        {
          exercise_id: hipThrust,
          position: 1,
          block_position: 1,
          params_json: { sets: 5, reps: 10 },
          reps_scheme: '10/10/8/8/6',
        },
      ],
    });

    // Month with a session whose only part is the library block (no inline items).
    const month = await makeInlineMonthTemplate({
      fx,
      weekCount: 1,
      dayPlans: [
        {
          day_of_week: 1,
          blocks: [
            { title: 'Fuerza', format: 'strength_block', source_block_id: blockId },
          ],
        },
      ],
    });

    const result = await instantiateMonthFromTemplate({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: month.monthId,
      start_date: '2026-01-05',
      client: sql,
    });
    expect(result.assignment_count).toBe(1);

    const rows = await sql<Array<{ template_id: string }>>`
      select wa.template_id::text from workout_assignments wa
      where wa.athlete_id = ${fx.athleteId}
    `;
    expect(rows).toHaveLength(1);

    const segs = await sql<
      Array<{ position: number; exercise_id: string; params_json: Record<string, unknown> }>
    >`
      select position, exercise_id::text, params_json
      from template_segments where template_id = ${Number(rows[0]!.template_id)}
      order by position
    `;
    // Both block_exercises materialized, in order, with real catalog ids.
    expect(segs.map((s) => Number(s.exercise_id))).toEqual([frontSquat, hipThrust]);
    // Params flow through unchanged (the canonical shape iOS/studio consume).
    expect(segs[0]!.params_json).toMatchObject({ sets: 5, reps: 10, load_pct: 65 });
    expect(segs[1]!.params_json).toMatchObject({ sets: 5, reps: 10 });
  });

  test('needs_review block (no block_exercises) contributes no segments', async () => {
    const fx = await baseFixture();
    const reviewBlock = await makeLibraryBlock({
      fx,
      title: 'HYROX SIMULATION completo',
      description: 'HYROX SIMULATION completo',
      needsReview: true,
      exercises: [], // no structure
    });

    const month = await makeInlineMonthTemplate({
      fx,
      weekCount: 1,
      dayPlans: [
        {
          day_of_week: 1,
          blocks: [
            { title: 'Simulación', format: 'hyrox_sim', source_block_id: reviewBlock },
          ],
        },
      ],
    });

    const result = await instantiateMonthFromTemplate({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: month.monthId,
      start_date: '2026-01-05',
      client: sql,
    });
    // The session has no other content → no assignment (nothing structured to
    // materialize). The block keeps its verbatim for Pablo to review/fill.
    expect(result.assignment_count).toBe(0);
  });

  test('a structured library block + an inline part both materialize', async () => {
    const fx = await baseFixture();
    const run = await makeExercise({ fx, name: 'Run' });
    const squat = await makeExercise({ fx, name: 'Back Squat' });

    const blockId = await makeLibraryBlock({
      fx,
      title: 'Run z2 1h',
      description: 'Run 1h zona 2',
      exercises: [
        { exercise_id: run, position: 0, params_json: { duration_seconds: 3600, hr_zone: 2 } },
      ],
    });

    const month = await makeInlineMonthTemplate({
      fx,
      weekCount: 1,
      dayPlans: [
        {
          day_of_week: 1,
          blocks: [
            { title: 'Cardio', format: 'tempo', source_block_id: blockId },
            {
              title: 'Fuerza',
              format: 'strength_block',
              items: [{ exercise_id: squat, exercise_name: 'Back Squat', params_json: { sets: 4, reps: 6 } }],
            },
          ],
        },
      ],
    });

    const result = await instantiateMonthFromTemplate({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: month.monthId,
      start_date: '2026-01-05',
      client: sql,
    });
    expect(result.assignment_count).toBe(1);

    const rows = await sql<Array<{ template_id: string }>>`
      select wa.template_id::text from workout_assignments wa where wa.athlete_id = ${fx.athleteId}
    `;
    const segs = await sql<Array<{ exercise_id: string; block_position: number }>>`
      select exercise_id::text, block_position
      from template_segments where template_id = ${Number(rows[0]!.template_id)}
      order by position
    `;
    // Library-block exercise (block_position 0) then inline exercise (block_position 1).
    expect(segs.map((s) => Number(s.exercise_id))).toEqual([run, squat]);
    expect(segs.map((s) => s.block_position)).toEqual([0, 1]);
  });
});
