/**
 * Real-DB integration tests for `resyncWeekTemplateAssignments` (0158).
 *
 * The bug this closes: a week already assigned to an athlete is a one-time
 * copy (`workout_assignments.template_id` → a materialized `templates` row).
 * Editing the source `program_week_templates.slots_json` afterwards — a
 * note, a swapped exercise, anything — saved fine but never reached the
 * athlete: nothing tied the copy back to its source. `resolveOrCreateMicrocycle`
 * now stamps `microcycles.source_week_template_id`, and this function uses
 * that lineage to push a fresh edit into any NOT-YET-EXECUTED assignment.
 * An assignment the athlete already acted on ('completed'/'partial'/
 * 'skipped'/'missed') must never be touched — verified explicitly below.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import {
  instantiateMonthFromTemplate,
  resyncWeekTemplateAssignments,
} from '@/lib/dashboard/coach/instantiate-program';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeExercise, makeInlineMonthTemplate, type Fixture } from '../utils/db-fixtures';

describeWithDb('resyncWeekTemplateAssignments (real DB)', () => {
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

  test('an edit to the source week reaches an already-assigned, still-scheduled day', async () => {
    const fx = await baseFixture();
    const glute = await makeExercise({ fx, name: 'Puente de glúteo' });

    const month = await makeInlineMonthTemplate({
      fx,
      weekCount: 1,
      dayPlans: [
        {
          day_of_week: 2, // Tuesday
          blocks: [
            {
              title: 'Compensatorio glúteo',
              format: 'circuit',
              items: [{ exercise_id: glute, exercise_name: 'Puente de glúteo', params_json: { sets: 4, reps: 12 } }],
            },
          ],
        },
      ],
    });
    const weekId = month.weekIds[0]!;

    await instantiateMonthFromTemplate({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: month.monthId,
      start_date: '2026-01-05', // Monday → Tuesday = 2026-01-06
      client: sql,
    });

    const before = await sql<Array<{ id: string; template_id: string; status: string }>>`
      select id::text, template_id::text, status::text from workout_assignments
      where athlete_id = ${fx.athleteId} and scheduled_for = '2026-01-06'::date
    `;
    expect(before).toHaveLength(1);
    const originalTemplateId = before[0]!.template_id;
    expect(before[0]!.status).toBe('scheduled');

    // The lineage 0158 exists to make possible: the microcycle knows which
    // week template it came from.
    const mc = await sql<Array<{ source_week_template_id: string | null }>>`
      select source_week_template_id::text from microcycles
      where athlete_id = ${fx.athleteId}
    `;
    expect(Number(mc[0]!.source_week_template_id)).toBe(weekId);

    // Simulate the coach editor save (day route persists exactly this shape):
    // add a per-exercise note to the SAME item, nothing else.
    const [week] = await sql<Array<{ slots_json: any }>>`
      select slots_json from program_week_templates where id = ${weekId}
    `;
    const editedSlots = structuredClone(week!.slots_json);
    editedSlots.days[0].sessions[0].blocks[0].items[0].notes =
      'Para las 4 series de 12 elige una carga con la que puedas hacer un par más al terminar cada una.';
    await sql`
      update program_week_templates set slots_json = ${sql.json(editedSlots)} where id = ${weekId}
    `;

    const result = await resyncWeekTemplateAssignments({
      coach_id: fx.coachId,
      week_template_id: weekId,
      client: sql,
    });
    expect(result.microcycles_checked).toBe(1);
    expect(result.assignments_resynced).toBe(1);

    const after = await sql<Array<{ id: string; template_id: string; status: string }>>`
      select id::text, template_id::text, status::text from workout_assignments
      where athlete_id = ${fx.athleteId} and scheduled_for = '2026-01-06'::date
    `;
    expect(after).toHaveLength(1); // resync updates in place — never a second row
    expect(after[0]!.id).toBe(before[0]!.id);
    expect(after[0]!.template_id).not.toBe(originalTemplateId); // fresh materialization
    expect(after[0]!.status).toBe('scheduled');

    const seg = await sql<Array<{ notes: string | null; exercise_name: string }>>`
      select ts.notes, e.name as exercise_name from template_segments ts
      join exercises e on e.id = ts.exercise_id
      where ts.template_id = ${Number(after[0]!.template_id)}
    `;
    expect(seg).toHaveLength(1);
    expect(seg[0]!.notes).toBe(
      'Para las 4 series de 12 elige una carga con la que puedas hacer un par más al terminar cada una.',
    );
  });

  test('an assignment the athlete already completed is never touched', async () => {
    const fx = await baseFixture();
    const squat = await makeExercise({ fx, name: 'Back Squat' });

    const month = await makeInlineMonthTemplate({
      fx,
      weekCount: 1,
      dayPlans: [
        {
          day_of_week: 1,
          blocks: [
            {
              title: 'Fuerza',
              format: 'strength_block',
              items: [{ exercise_id: squat, exercise_name: 'Back Squat', params_json: { sets: 3, reps: 8 } }],
            },
          ],
        },
      ],
    });
    const weekId = month.weekIds[0]!;

    await instantiateMonthFromTemplate({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: month.monthId,
      start_date: '2026-02-02', // Monday
      client: sql,
    });

    const before = await sql<Array<{ id: string; template_id: string }>>`
      select id::text, template_id::text from workout_assignments
      where athlete_id = ${fx.athleteId} and scheduled_for = '2026-02-02'::date
    `;
    expect(before).toHaveLength(1);

    // The athlete finished it — the ONLY writer that flips this is the manual
    // recorder (lib/sync/assignment-status.ts); mirrored here directly.
    await sql`
      update workout_assignments set status = 'completed'::assignment_status
      where id = ${Number(before[0]!.id)}
    `;

    const [week] = await sql<Array<{ slots_json: any }>>`
      select slots_json from program_week_templates where id = ${weekId}
    `;
    const editedSlots = structuredClone(week!.slots_json);
    editedSlots.days[0].sessions[0].blocks[0].items[0].exercise_name = 'Front Squat';
    await sql`
      update program_week_templates set slots_json = ${sql.json(editedSlots)} where id = ${weekId}
    `;

    const result = await resyncWeekTemplateAssignments({
      coach_id: fx.coachId,
      week_template_id: weekId,
      client: sql,
    });
    // The microcycle is still checked — the guard is per-assignment, not a
    // blanket skip of the whole week (a day-2 edit must still land even if
    // day-1 is already done).
    expect(result.microcycles_checked).toBe(1);
    expect(result.assignments_resynced).toBe(0);

    const after = await sql<Array<{ template_id: string; status: string }>>`
      select template_id::text, status::text from workout_assignments
      where id = ${Number(before[0]!.id)}
    `;
    expect(after[0]!.template_id).toBe(before[0]!.template_id); // untouched
    expect(after[0]!.status).toBe('completed');
  });
});
