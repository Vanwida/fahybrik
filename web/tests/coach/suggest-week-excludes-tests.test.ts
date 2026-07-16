/**
 * Real-DB regression guard for the bug that shipped: a coach whose library held
 * nothing but his four CALIBRATION TESTS got a week made of them — Monday HYROX
 * half-sim, Tuesday 1RM battery, Wednesday 2K row. A test MEASURES the athlete.
 * It is not a session, and no amount of library-emptiness makes it one.
 *
 * Seeds a real coach with one training template and one calibration-test template
 * (linked exactly as `restore-default-tests` links them, mig 0112) and asserts the
 * week generator can only ever reach for the training one.
 */
import { afterAll, expect, it } from 'vitest';
import { suggestWeekPlan } from '@/lib/dashboard/coach/ai/suggest-week';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

describeWithDb('suggest-week excludes calibration tests', () => {
  let fx: Fixture;

  afterAll(async () => {
    if (fx) await fx.cleanup();
    await closeTestSql();
  });

  async function seed(): Promise<{ trainingId: number; testId: number }> {
    const sql = getTestSql();
    fx = await makeCoachAndAthlete(sql);

    const trainingId = await makeTemplate({ fx, name: 'Fuerza tren inferior', format: 'strength_block' });
    const testId = await makeTemplate({ fx, name: 'Batería 1RM', format: 'strength_block' });

    // Both need a segment: the generator only considers templates with content.
    for (const id of [trainingId, testId]) {
      await sql`
        insert into template_segments (template_id, position, exercise_id, params_json)
        select ${id}, 1, e.id, '{"sets":3,"reps":5}'::jsonb from exercises e limit 1
      `;
    }

    // Mark the second one as a calibration test the way the real code does.
    await sql`
      insert into coach_calibration_tests (coach_id, slug, name, format, template_id)
      values (${fx.coachId}, 'one_rm_battery', 'Batería 1RM', 'strength_block', ${testId})
    `;
    return { trainingId, testId };
  }

  // `fast` mode is the deterministic library dealer — no model, so this asserts the
  // SOURCE of the library rather than any LLM behaviour.
  it('never deals a calibration-test template into a week', async () => {
    const { testId } = await seed();
    const week = await suggestWeekPlan({
      coach_id: fx.coachId,
      body: { focus: 'fuerza y HYROX', mode: 'fast' },
      client: getTestSql(),
    });

    const names = week.matched_templates.map((m) => m.template_name);
    const ids = week.matched_templates.map((m) => String(m.template_id));

    expect(names).not.toContain('Batería 1RM');
    expect(ids).not.toContain(String(testId));
    // The training template is still fair game — we excluded tests, not the library.
    expect(names).toContain('Fuerza tren inferior');
  });

  it('leaves the week honestly empty rather than filling it with tests', async () => {
    const sql = getTestSql();
    const { testId } = await seed();
    // Now the ONLY template with content is the calibration test — Alex's exact case.
    await sql`delete from template_segments where template_id != ${testId} and template_id in (
      select id from templates where coach_id = ${fx.coachId}
    )`;

    const week = await suggestWeekPlan({
      coach_id: fx.coachId,
      body: { focus: 'HYROX', mode: 'fast' },
      client: sql,
    });

    expect(week.matched_templates).toHaveLength(0);
    expect(week.days.every((d) => !d.preview_label?.includes('Batería'))).toBe(true);
  });
});
