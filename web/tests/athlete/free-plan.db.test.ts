/**
 * Real-DB: saveFreeWorkoutPlan persists template + assignment WITHOUT execution.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { isoDateString, startOfDayInBox } from '@fahybrid/shared/domain/dates';
import type { Prescription } from '@fahybrid/shared/domain/prescription';
import { saveFreeWorkoutPlan } from '@/lib/athlete/create-free-workout';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeExercise, type Fixture } from '../utils/db-fixtures';

const p = (pres: Prescription): Prescription => pres;
const DB_TIMEOUT = 30_000;

describeWithDb('entreno libre — saveFreeWorkoutPlan (plan only, real DB)', () => {
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

  async function newFixture(): Promise<Fixture> {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    return fx;
  }

  test(
    'plan-only save → scheduled assignment, no workout_executions row',
    async () => {
      const fx = await newFixture();
      const today = isoDateString(startOfDayInBox(new Date()));

      const result = await saveFreeWorkoutPlan({
        athleteId: fx.athleteId,
        coachId: fx.coachId,
        title: 'Guardado para luego',
        scheme: 'intervals',
        scheduledFor: today,
        kind: 'measured',
        modality: 'row',
        prescription: p({
          scheme: 'intervals',
          modality: 'row',
          sets: [{ measure: { kind: 'distance', meters: 500 } }],
          rounds: 4,
          rest_s: 90,
        }),
      });

      const assignmentId = Number(result.assignment_id);
      const [asg] = await sql<
        Array<{ status: string; origin: string; scheduled_for: string }>
      >`
        select status::text as status, origin::text as origin,
               to_char(scheduled_for, 'YYYY-MM-DD') as scheduled_for
        from workout_assignments where id = ${assignmentId}
      `;
      expect(asg?.status).toBe('scheduled');
      expect(asg?.origin).toBe('self');
      expect(asg?.scheduled_for).toBe(today);

      const execRows = await sql<Array<{ id: string }>>`
        select id::text as id from workout_executions where assignment_id = ${assignmentId}
      `;
      expect(execRows).toHaveLength(0);
    },
    DB_TIMEOUT,
  );

  test(
    'functional CLOCK plan → zero segments, prescription on meta_json',
    async () => {
      const fx = await newFixture();

      const result = await saveFreeWorkoutPlan({
        athleteId: fx.athleteId,
        coachId: fx.coachId,
        title: 'EMOM guardado',
        scheme: 'emom',
        kind: 'clock',
        prescription: p({
          scheme: 'emom',
          modality: 'functional',
          sets: [],
          rounds: 10,
          work_s: 60,
        }),
      });

      const assignmentId = Number(result.assignment_id);
      const [tpl] = await sql<Array<{ template_id: string; seg_count: string }>>`
        select wa.template_id::text as template_id,
               (select count(*)::text from template_segments ts where ts.template_id = wa.template_id) as seg_count
        from workout_assignments wa where wa.id = ${assignmentId}
      `;
      expect(Number(tpl?.seg_count)).toBe(0);

      const [meta] = await sql<Array<{ prescription: { scheme?: string } }>>`
        select t.meta_json->'prescription' as prescription
        from templates t where t.id = ${Number(tpl!.template_id)}
      `;
      expect(meta?.prescription?.scheme).toBe('emom');
    },
    DB_TIMEOUT,
  );

  test(
    'strength plan with items → ordered segments, still no execution',
    async () => {
      const fx = await newFixture();
      const squat = await makeExercise({
        fx,
        name: 'Squat',
        modality: 'strength',
        category: 'strength',
      });

      const result = await saveFreeWorkoutPlan({
        athleteId: fx.athleteId,
        coachId: fx.coachId,
        title: 'Fuerza guardada',
        scheme: 'sets',
        kind: 'items',
        items: [
          {
            exerciseId: squat,
            prescription: p({
              scheme: 'sets',
              modality: 'strength',
              sets: [{ measure: { kind: 'reps', value: 5 } }],
            }),
          },
        ],
      });

      const assignmentId = Number(result.assignment_id);
      const segs = await sql<Array<{ position: number }>>`
        select ts.position from template_segments ts
        join workout_assignments wa on wa.template_id = ts.template_id
        where wa.id = ${assignmentId}
        order by ts.position
      `;
      expect(segs.map((s) => s.position)).toEqual([1]);

      const execRows = await sql`select 1 from workout_executions where assignment_id = ${assignmentId}`;
      expect(execRows.length).toBe(0);
    },
    DB_TIMEOUT,
  );
});
