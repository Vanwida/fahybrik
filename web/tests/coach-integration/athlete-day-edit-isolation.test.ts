/**
 * Real-DB integration test for the PER-ATHLETE day editor write path (Fase 2).
 *
 * Proves the load-bearing invariant: when a coach edits ONE athlete's day, the
 * write lands ONLY on that athlete's INSTANCE template (`template_segments`) and
 * NEVER on the library template it was cloned from, nor on another athlete's
 * instance cloned from the same library template. Also locks the isolation GUARD
 * (a coach cannot reach a library row or another athlete's instance through the
 * per-athlete route) and that the athlete week-plan resolution reflects the edit.
 *
 * Scenario (the exact shape the demo cannot reproduce — its seed instances carry
 * no shared-source lineage):
 *   library L  ──clone──▶ instance A (athlete A, assigned on D)
 *              └─clone──▶ instance B (athlete B, assigned on D)
 *   edit A's day  ⇒  A changes; L unchanged; B unchanged.
 *
 * No SQL is mocked — every assertion re-queries the Neon test branch. The fixture
 * creates its own coach/athletes/templates and tears them down (no seed deps).
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import type { Prescription } from '@fahybrid/shared/domain/prescription';
import { createTemplate } from '@/lib/dashboard/coach/templates';
import { cloneTemplateAsInstance, updateAthleteInstanceDay } from '@/lib/dashboard/coach/template-instance';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeExercise, type Fixture } from '../utils/db-fixtures';

const DATE = '2026-07-01';

const presc = (reps: number, pct: number): Prescription => ({
  scheme: 'sets',
  modality: 'strength',
  sets: [{ measure: { kind: 'reps', value: reps }, target: { kind: 'percent_rm', value: pct }, rest_s: 120 }],
});

type SegRow = {
  block_position: number;
  block_title: string | null;
  block_format: string | null;
  exercise_id: string;
  prescription_json: unknown;
  notes: string | null;
};

describeWithDb('per-athlete day edit — instance isolation (real DB)', () => {
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

  async function segsOf(templateId: number): Promise<SegRow[]> {
    return sql<SegRow[]>`
      select block_position, block_title, block_format, exercise_id::text as exercise_id,
             prescription_json, notes
      from template_segments where template_id = ${templateId}
      order by block_position, position
    `;
  }

  test('edits hit only the athlete instance; library + sibling untouched; guard + week-plan hold', async () => {
    const fx: Fixture = await makeCoachAndAthlete(sql); // athlete A
    cleanups.push(fx.cleanup);
    const athleteA = fx.athleteId;
    const coach = fx.coachId;

    // A second athlete B under the SAME coach (for the shared-source sibling).
    const bUser = await sql<Array<{ id: string }>>`
      insert into users (email, role) values (${`athB-${Date.now()}@test.local`}, 'athlete') returning id::text`;
    const bUserId = Number(bUser[0]!.id);
    const bRow = await sql<Array<{ id: string }>>`
      insert into athletes (user_id, coach_id, full_name) values (${bUserId}, ${coach}, 'Athlete B') returning id::text`;
    const athleteB = Number(bRow[0]!.id);
    cleanups.push(async () => {
      await sql`delete from workout_assignments where athlete_id = ${athleteB}`;
      await sql`delete from athletes where id = ${athleteB}`;
      await sql`delete from users where id = ${bUserId}`;
    });

    const exA = await makeExercise({ fx, name: 'Squat A' });
    const exB = await makeExercise({ fx, name: 'Squat B' });

    // Library template L with 2 segments (the coach's reusable workout).
    const libId = Number(
      await createTemplate({
        coach_id: coach,
        client: sql,
        payload: {
          name: 'Library leg day',
          format: 'strength_block',
          segments: [
            { exercise_id: exA, position: 0, block_position: 0, block_title: 'A', block_format: 'strength_block', prescription_json: presc(10, 60) },
            { exercise_id: exB, position: 1, block_position: 1, block_title: 'B', block_format: 'strength_block', prescription_json: presc(8, 70) },
          ],
        },
      }),
    );
    fx.templateIds.push(libId);

    // Clone L into a private instance for A and for B (shared source lineage).
    const instA = (await cloneTemplateAsInstance({ client: sql, source_template_id: libId, athlete_id: athleteA }))!;
    const instB = (await cloneTemplateAsInstance({ client: sql, source_template_id: libId, athlete_id: athleteB }))!;
    fx.templateIds.push(instA.template_id, instB.template_id);

    // Assign each instance to its athlete on date D.
    await sql`insert into workout_assignments (athlete_id, scheduled_for, template_id, template_version, status)
      values (${athleteA}, ${DATE}::date, ${instA.template_id}, 1, 'scheduled')`;
    await sql`insert into workout_assignments (athlete_id, scheduled_for, template_id, template_version, status)
      values (${athleteB}, ${DATE}::date, ${instB.template_id}, 1, 'scheduled')`;

    const libBefore = await segsOf(libId);
    const bBefore = await segsOf(instB.template_id);
    expect(libBefore).toHaveLength(2);
    expect(bBefore).toHaveLength(2);

    // EDIT athlete A's day: a single different block/exercise/prescription + new title.
    await updateAthleteInstanceDay({
      coach_id: coach,
      athlete_id: athleteA,
      iso_date: DATE,
      client: sql,
      payload: {
        template_id: instA.template_id,
        name: 'A — edited leg day',
        segments: [
          { exercise_id: exB, block_position: 0, block_title: 'EDITED', block_format: 'strength_block', prescription_json: presc(5, 85), notes: 'tope' },
        ],
      },
    });

    // A changed to exactly the edit.
    const aAfter = await segsOf(instA.template_id);
    expect(aAfter).toHaveLength(1);
    expect(aAfter[0]!.block_title).toBe('EDITED');
    expect(aAfter[0]!.exercise_id).toBe(String(exB));
    expect(aAfter[0]!.notes).toBe('tope');
    expect(aAfter[0]!.prescription_json).toEqual(presc(5, 85));
    const aName = await sql<Array<{ name: string }>>`select name from templates where id = ${instA.template_id}`;
    expect(aName[0]!.name).toBe('A — edited leg day');

    // ISOLATION: library L and sibling instance B are byte-for-byte unchanged.
    expect(await segsOf(libId)).toEqual(libBefore);
    expect(await segsOf(instB.template_id)).toEqual(bBefore);

    // GUARD: cannot edit the LIBRARY row through A's route (instance_athlete_id null).
    await expect(
      updateAthleteInstanceDay({
        coach_id: coach, athlete_id: athleteA, iso_date: DATE, client: sql,
        payload: { template_id: libId, segments: [{ exercise_id: exA, block_position: 0, prescription_json: presc(1, 1) }] },
      }),
    ).rejects.toThrow();
    // GUARD: cannot edit B's instance through A's route.
    await expect(
      updateAthleteInstanceDay({
        coach_id: coach, athlete_id: athleteA, iso_date: DATE, client: sql,
        payload: { template_id: instB.template_id, segments: [{ exercise_id: exA, block_position: 0, prescription_json: presc(1, 1) }] },
      }),
    ).rejects.toThrow();
    // The guard rejections did not mutate anything.
    expect(await segsOf(libId)).toEqual(libBefore);
    expect(await segsOf(instB.template_id)).toEqual(bBefore);

    // WEEK-PLAN RESOLUTION: athlete A's assignment → its instance → the edited
    // segments (the same path GET /api/athlete/plan/week reads).
    const resolved = await sql<Array<{ template_id: string }>>`
      select wa.template_id::text as template_id from workout_assignments wa
      where wa.athlete_id = ${athleteA} and wa.scheduled_for = ${DATE}::date limit 1`;
    expect(resolved[0]!.template_id).toBe(String(instA.template_id));
    expect(await segsOf(Number(resolved[0]!.template_id))).toEqual(aAfter);
  });
});
