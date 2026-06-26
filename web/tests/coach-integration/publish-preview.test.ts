/**
 * Real-DB integration tests for the publish PREVIEW (Fase 5).
 *
 * `buildPublishPreview` must report EXACTLY what `instantiateMonthFromTemplate`
 * would materialize, without persisting anything: same week/day/session order,
 * same slot labels, same exercise hydration (library blocks via
 * `block_exercises`), and the same `session_count` as the real assignment.
 *
 * It also locks in the honest-empty contract: a `needs_review` library block
 * (no structure) surfaces as `needs_review: true` and does NOT inflate the
 * session count. No SQL is mocked.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { buildPublishPreview } from '@/lib/dashboard/coach/publish-preview';
import { instantiateMonthFromTemplate } from '@/lib/dashboard/coach/instantiate-program';
import { notifyAthlete } from '@/lib/notifications/dispatch';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeCoachAndAthlete,
  makeExercise,
  makeLibraryBlock,
  makeInlineMonthTemplate,
  type Fixture,
} from '../utils/db-fixtures';

describeWithDb('buildPublishPreview — mirrors materialization (real DB)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];
  const START = '2026-01-05'; // Monday

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
  });
  afterAll(async () => {
    await closeTestSql();
  });

  async function baseFixture(): Promise<Fixture> {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    return fx;
  }

  test('preview structure matches inline blocks + real dates, count = materialization', async () => {
    const fx = await baseFixture();
    const ski = await makeExercise({ fx, name: 'SkiErg' });
    const squat = await makeExercise({ fx, name: 'Back Squat' });

    const month = await makeInlineMonthTemplate({
      fx,
      weekCount: 1,
      dayPlans: [
        {
          day_of_week: 1,
          blocks: [
            { title: 'Calentamiento', format: 'tempo', items: [{ exercise_id: ski, exercise_name: 'SkiErg' }] },
            { title: 'Fuerza', format: 'strength_block', items: [{ exercise_id: squat, exercise_name: 'Back Squat' }] },
          ],
        },
      ],
    });

    const preview = await buildPublishPreview({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: month.monthId,
      start_date: START,
      client: sql,
    });

    // One materializable session (Monday workout).
    expect(preview.session_count).toBe(1);
    expect(preview.week_count).toBe(1);
    expect(preview.start_date).toBe(START);
    expect(preview.end_date).toBe('2026-01-11'); // Sunday of week 1

    const day = preview.weeks[0]!.days[0]!;
    expect(day.day_of_week).toBe(1);
    expect(day.date).toBe(START); // Monday → start date
    const session = day.sessions[0]!;
    expect(session.slot).toBe('am');
    expect(session.materializes).toBe(true);
    expect(session.exercise_count).toBe(2);
    expect(session.blocks.map((b) => b.title)).toEqual(['Calentamiento', 'Fuerza']);
    expect(session.blocks[0]!.exercises).toEqual(['SkiErg']);
    expect(session.blocks[1]!.exercises).toEqual(['Back Squat']);

    // The preview's session_count equals the real materialization's count.
    const result = await instantiateMonthFromTemplate({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: month.monthId,
      start_date: START,
      client: sql,
    });
    expect(result.assignment_count).toBe(preview.session_count);
  });

  test('needs_review library block is honest-empty: flagged, not counted', async () => {
    const fx = await baseFixture();
    // Library block with NO structure (needs_review).
    const blockId = await makeLibraryBlock({
      fx,
      title: 'WOD verbatim',
      description: '21-15-9 thrusters + pull-ups',
      needsReview: true,
    });

    const month = await makeInlineMonthTemplate({
      fx,
      weekCount: 1,
      dayPlans: [
        {
          day_of_week: 2,
          blocks: [{ title: 'WOD', source_block_id: blockId }],
        },
      ],
    });

    const preview = await buildPublishPreview({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: month.monthId,
      start_date: START,
      client: sql,
    });

    // No structured exercises → 0 materializable sessions (empty-honest).
    expect(preview.session_count).toBe(0);
    const session = preview.weeks[0]!.days[0]!.sessions[0]!;
    expect(session.materializes).toBe(false);
    expect(session.blocks[0]!.needs_review).toBe(true);
    expect(session.blocks[0]!.exercises).toEqual([]);

    // And the real materialization indeed creates zero assignments.
    const result = await instantiateMonthFromTemplate({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: month.monthId,
      start_date: START,
      client: sql,
    });
    expect(result.assignment_count).toBe(0);
  });

  test('plan_published notification reaches the athlete user', async () => {
    const fx = await baseFixture();
    const out = await notifyAthlete({
      sql,
      athlete_id: BigInt(fx.athleteId),
      type: 'plan_published',
      payload: { athlete_id: String(fx.athleteId), week_start: START },
      push: { title: 'Tu plan esta listo', body: 'Pablo ha publicado tu plan.' },
    });
    expect(out?.id).toBeTruthy();

    const rows = await sql<Array<{ type: string; user_id: string }>>`
      select type::text, user_id::text from notifications
      where user_id = ${fx.athleteUserId} and type = 'plan_published'
    `;
    expect(rows).toHaveLength(1);

    // Teardown: notifications aren't in the fixture's purge set.
    await sql`delete from notifications where user_id = ${fx.athleteUserId}`;
  });
});
