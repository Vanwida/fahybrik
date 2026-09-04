/**
 * Real-DB tests for the athlete-day REST primitive (FH-79).
 *
 * Rest = zero `scheduled` assignments that day. Does not rewrite
 * template_segments, does not resync the week group, does not mutate the
 * library recipe, does not require `notes like 'slot:%'`.
 *
 * Cases from the Plan: A clear→rest; B same microciclo intact; completed kept;
 * mixed only pending. Isolation of the edit path stays in
 * athlete-day-edit-isolation.test.ts — this file locks the same boundary for REST.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import type { Prescription } from '@fahybrid/shared/domain/prescription';
import { createTemplate } from '@/lib/dashboard/coach/templates';
import { cloneTemplateAsInstance } from '@/lib/dashboard/coach/template-instance';
import { clearAthleteDayScheduled } from '@/lib/dashboard/coach/day-sessions';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeAssignment,
  makeCoachAndAthlete,
  makeExercise,
  makeMicrocycle,
  type Fixture,
} from '../utils/db-fixtures';

const DAY_A = '2026-07-06';
const DAY_B = '2026-07-07';
const ACTOR = { kind: 'system', user_id: null } as const;

const presc = (reps: number): Prescription => ({
  scheme: 'sets',
  modality: 'strength',
  sets: [{ measure: { kind: 'reps', value: reps }, target: { kind: 'percent_rm', value: 70 }, rest_s: 90 }],
});

describeWithDb('athlete-day rest — clear scheduled (real DB)', () => {
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

  async function seedLibrary(fx: Fixture): Promise<number> {
    const ex = await makeExercise({ fx, name: 'Rest-day squat' });
    const libId = Number(
      await createTemplate({
        coach_id: fx.coachId,
        client: sql,
        payload: {
          name: 'Library session',
          format: 'strength_block',
          segments: [
            {
              exercise_id: ex,
              position: 0,
              block_position: 0,
              block_title: 'A',
              block_format: 'strength_block',
              prescription_json: presc(5),
            },
          ],
        },
      }),
    );
    fx.templateIds.push(libId);
    return libId;
  }

  async function forkAndAssign(params: {
    fx: Fixture;
    libId: number;
    athleteId: number;
    iso: string;
    status?: 'scheduled' | 'completed' | 'missed' | 'skipped';
    notes?: string | null;
    microcycleId?: number;
    origin?: 'coach' | 'self';
    assignmentStatusRaw?: string;
  }): Promise<{ templateId: number; assignmentId: number }> {
    const inst = (await cloneTemplateAsInstance({
      client: sql,
      source_template_id: params.libId,
      athlete_id: params.athleteId,
    }))!;
    params.fx.templateIds.push(inst.template_id);

    if (params.athleteId === params.fx.athleteId && !params.origin && !params.assignmentStatusRaw) {
      const assignmentId = await makeAssignment({
        fx: params.fx,
        templateId: inst.template_id,
        scheduledForIso: params.iso,
        status: params.status,
        notes: params.notes,
        microcycleId: params.microcycleId,
      });
      return { templateId: inst.template_id, assignmentId };
    }

    const status = params.assignmentStatusRaw ?? params.status ?? 'scheduled';
    const origin = params.origin ?? 'coach';
    const rows = await sql<Array<{ id: string }>>`
      insert into workout_assignments (
        athlete_id, microcycle_id, scheduled_for, template_id, template_version, status, notes, origin
      )
      values (
        ${params.athleteId},
        ${params.microcycleId ?? null},
        ${params.iso}::date,
        ${inst.template_id},
        1,
        ${status}::assignment_status,
        ${params.notes ?? null},
        ${origin}::workout_origin
      )
      returning id::text
    `;
    return { templateId: inst.template_id, assignmentId: Number(rows[0]!.id) };
  }

  async function assignmentIds(athleteId: number, iso: string): Promise<string[]> {
    const rows = await sql<Array<{ id: string }>>`
      select id::text from workout_assignments
      where athlete_id = ${athleteId} and scheduled_for = ${iso}::date
      order by id
    `;
    return rows.map((r) => r.id);
  }

  async function templateExists(id: number): Promise<boolean> {
    const rows = await sql<Array<{ n: number }>>`
      select count(*)::int as n from templates where id = ${id}
    `;
    return (rows[0]?.n ?? 0) > 0;
  }

  test('A — scheduled without slot: notes clears to rest; orphan instance deleted', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const libId = await seedLibrary(fx);
    const libBefore = await sql`select id from template_segments where template_id = ${libId}`;

    const a = await forkAndAssign({
      fx,
      libId,
      athleteId: fx.athleteId,
      iso: DAY_A,
      notes: 'coach_title:Fuerza',
    });

    const result = await clearAthleteDayScheduled({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      iso_date: DAY_A,
      client: sql,
      actor: ACTOR,
    });
    expect(result.cleared).toBe(1);
    expect(await assignmentIds(fx.athleteId, DAY_A)).toEqual([]);
    expect(await templateExists(a.templateId)).toBe(false);
    expect(await templateExists(libId)).toBe(true);
    expect(await sql`select id from template_segments where template_id = ${libId}`).toEqual(libBefore);

    const trail = await sql<Array<{ action: string; diff_json: unknown }>>`
      select action::text, diff_json
      from audit_log
      where entity_type = 'workout_assignments' and entity_id = ${a.assignmentId}
      order by created_at desc limit 1
    `;
    expect(trail).toHaveLength(1);
    expect(trail[0]!.action).toBe('delete');
    expect(trail[0]!.diff_json).toMatchObject({
      athlete_id: fx.athleteId,
      iso_date: DAY_A,
      kind: 'rest',
      cleared: 1,
    });
  });

  test('B — same microciclo other day intact', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const libId = await seedLibrary(fx);
    const { microcycleId } = await makeMicrocycle({
      sql,
      athleteId: fx.athleteId,
      startIso: '2026-07-06',
      endIso: '2026-07-12',
    });
    const mon = await forkAndAssign({
      fx, libId, athleteId: fx.athleteId, iso: DAY_A, microcycleId,
    });
    const tue = await forkAndAssign({
      fx, libId, athleteId: fx.athleteId, iso: DAY_B, microcycleId,
    });

    await clearAthleteDayScheduled({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      iso_date: DAY_A,
      client: sql,
      actor: ACTOR,
    });

    expect(await assignmentIds(fx.athleteId, DAY_A)).toEqual([]);
    expect(await assignmentIds(fx.athleteId, DAY_B)).toEqual([String(tue.assignmentId)]);
    expect(await templateExists(mon.templateId)).toBe(false);
    expect(await templateExists(tue.templateId)).toBe(true);

    const mc = await sql<Array<{ start_date: string; end_date: string; week_number: number }>>`
      select to_char(start_date, 'YYYY-MM-DD') as start_date,
             to_char(end_date, 'YYYY-MM-DD') as end_date,
             week_number
      from microcycles where id = ${microcycleId}
    `;
    expect(mc[0]).toEqual({ start_date: '2026-07-06', end_date: '2026-07-12', week_number: 1 });
  });

  test('completed on the same day is kept, including its instance', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const libId = await seedLibrary(fx);
    const pending = await forkAndAssign({ fx, libId, athleteId: fx.athleteId, iso: DAY_A });
    const done = await forkAndAssign({
      fx, libId, athleteId: fx.athleteId, iso: DAY_A, status: 'completed',
    });

    await clearAthleteDayScheduled({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      iso_date: DAY_A,
      client: sql,
      actor: ACTOR,
    });

    expect(await assignmentIds(fx.athleteId, DAY_A)).toEqual([String(done.assignmentId)]);
    const kept = await sql<Array<{ status: string }>>`
      select status::text from workout_assignments where id = ${done.assignmentId}
    `;
    expect(kept[0]!.status).toBe('completed');
    expect(await templateExists(pending.templateId)).toBe(false);
    expect(await templateExists(done.templateId)).toBe(true);
  });

  test('mixed day clears only coach scheduled; partial/missed/skipped/self stay', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const libId = await seedLibrary(fx);

    const pending = await forkAndAssign({
      fx, libId, athleteId: fx.athleteId, iso: DAY_A, notes: 'slot:am',
    });
    const extraPending = await forkAndAssign({
      fx, libId, athleteId: fx.athleteId, iso: DAY_A, notes: null,
    });
    const partial = await forkAndAssign({
      fx, libId, athleteId: fx.athleteId, iso: DAY_A, assignmentStatusRaw: 'partial',
    });
    const missed = await forkAndAssign({
      fx, libId, athleteId: fx.athleteId, iso: DAY_A, status: 'missed',
    });
    const skipped = await forkAndAssign({
      fx, libId, athleteId: fx.athleteId, iso: DAY_A, status: 'skipped',
    });
    const libre = await forkAndAssign({
      fx, libId, athleteId: fx.athleteId, iso: DAY_A, origin: 'self',
    });

    const result = await clearAthleteDayScheduled({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      iso_date: DAY_A,
      client: sql,
      actor: ACTOR,
    });
    expect(result.cleared).toBe(2);

    const left = await sql<Array<{ id: string; status: string; origin: string }>>`
      select id::text, status::text, origin::text
      from workout_assignments
      where athlete_id = ${fx.athleteId} and scheduled_for = ${DAY_A}::date
      order by id
    `;
    expect(left.map((r) => Number(r.id)).sort()).toEqual(
      [partial.assignmentId, missed.assignmentId, skipped.assignmentId, libre.assignmentId].sort(),
    );
    expect(left.find((r) => Number(r.id) === libre.assignmentId)?.origin).toBe('self');
    expect(await templateExists(pending.templateId)).toBe(false);
    expect(await templateExists(extraPending.templateId)).toBe(false);
    expect(await templateExists(partial.templateId)).toBe(true);
    expect(await templateExists(libre.templateId)).toBe(true);
  });

  test('409 when nothing scheduled to clear; second call is honest no-op', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const libId = await seedLibrary(fx);
    await forkAndAssign({
      fx, libId, athleteId: fx.athleteId, iso: DAY_A, status: 'completed',
    });

    await expect(
      clearAthleteDayScheduled({
        coach_id: fx.coachId,
        athlete_id: fx.athleteId,
        iso_date: DAY_A,
        client: sql,
        actor: ACTOR,
      }),
    ).rejects.toMatchObject({ name: 'DaySessionError', code: 'no_scheduled', status: 409 });
    expect(await assignmentIds(fx.athleteId, DAY_A)).toHaveLength(1);
  });

  test('rest on A leaves library + sibling B untouched (isolation regression)', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const libId = await seedLibrary(fx);

    const bUser = await sql<Array<{ id: string }>>`
      insert into users (email, role) values (${`athB-rest-${Date.now()}@test.local`}, 'athlete')
      returning id::text`;
    const bUserId = Number(bUser[0]!.id);
    const bRow = await sql<Array<{ id: string }>>`
      insert into athletes (user_id, coach_id, full_name)
      values (${bUserId}, ${fx.coachId}, 'Athlete B') returning id::text`;
    const athleteB = Number(bRow[0]!.id);
    cleanups.push(async () => {
      await sql`delete from workout_assignments where athlete_id = ${athleteB}`;
      await sql`delete from templates where instance_athlete_id = ${athleteB}`;
      await sql`delete from athletes where id = ${athleteB}`;
      await sql`delete from users where id = ${bUserId}`;
    });

    const a = await forkAndAssign({ fx, libId, athleteId: fx.athleteId, iso: DAY_A });
    const b = await forkAndAssign({ fx, libId, athleteId: athleteB, iso: DAY_A });
    const libSegsBefore = await sql`select * from template_segments where template_id = ${libId} order by position`;
    const bSegsBefore = await sql`select * from template_segments where template_id = ${b.templateId} order by position`;

    await clearAthleteDayScheduled({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      iso_date: DAY_A,
      client: sql,
      actor: ACTOR,
    });

    expect(await assignmentIds(fx.athleteId, DAY_A)).toEqual([]);
    expect(await assignmentIds(athleteB, DAY_A)).toEqual([String(b.assignmentId)]);
    expect(await templateExists(a.templateId)).toBe(false);
    expect(await templateExists(b.templateId)).toBe(true);
    expect(await templateExists(libId)).toBe(true);
    expect(await sql`select * from template_segments where template_id = ${libId} order by position`).toEqual(libSegsBefore);
    expect(await sql`select * from template_segments where template_id = ${b.templateId} order by position`).toEqual(bSegsBefore);
  });
});
