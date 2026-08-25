/**
 * Copy athlete instance → plan recipe (card 90).
 *
 * Pure helpers always run. The real-DB suite (describeWithDb) proves isolation:
 * promoting A lands on the recipe that produced A; athlete B is unchanged;
 * confirm is required when others still point at that recipe.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import type { Prescription } from '@fahybrid/shared/domain/prescription';
import { createTemplate } from '@/lib/dashboard/coach/templates';
import {
  cloneTemplateAsInstance,
  createAuthoredInstance,
  updateAthleteInstanceDay,
} from '@/lib/dashboard/coach/template-instance';
import { instantiateMonthFromTemplate } from '@/lib/dashboard/coach/instantiate-program';
import { copyAthleteInstanceDayToRecipe, RecipePromoteError } from '@/lib/dashboard/coach/copy-instance-to-recipe';
import {
  circuitFromTemplateBlockRow,
  dayOfWeekFromIso,
  instanceBlocksToWeekParts,
  sessionIndexInDay,
  weekdayLabelEs,
} from '@/lib/dashboard/coach/copy-instance-to-recipe-model';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeCoachAndAthlete,
  makeExercise,
  makeInlineMonthTemplate,
  type Fixture,
} from '../utils/db-fixtures';

const DATE = '2026-07-01';
const ACTOR = { kind: 'system', user_id: null } as const;

const presc = (reps: number, pct: number): Prescription => ({
  scheme: 'sets',
  modality: 'strength',
  sets: [
    {
      measure: { kind: 'reps', value: reps },
      target: { kind: 'percent_rm', value: pct },
      rest_s: 120,
    },
  ],
});

test('sessionIndexInDay follows assignment order on that date', () => {
  expect(sessionIndexInDay([10, 20, 30], 20)).toBe(1);
  expect(sessionIndexInDay([10], 99)).toBe(0);
});

test('dayOfWeekFromIso is Monday=1 … Sunday=7', () => {
  expect(dayOfWeekFromIso('2026-01-05')).toBe(1);
  expect(dayOfWeekFromIso('2026-01-06')).toBe(2);
  expect(dayOfWeekFromIso('2026-01-11')).toBe(7);
});

test('weekdayLabelEs names the recipe day in Spanish', () => {
  expect(weekdayLabelEs(2)).toBe('Martes');
});

test('instanceBlocksToWeekParts copies prescription and notes, not invented fields', () => {
  const parts = instanceBlocksToWeekParts(
    [
      {
        block_position: 0,
        block_title: 'EDITED',
        block_format: 'strength_block',
        items: [
          {
            id: '9',
            position: 0,
            exercise_id: 44,
            exercise_name: 'Squat B',
            params_json: {},
            prescription_json: presc(5, 85),
            notes: 'tope',
          },
        ],
      },
    ],
    'strength_block',
    new Map(),
  );
  expect(parts).toHaveLength(1);
  expect(parts[0]!.title).toBe('EDITED');
  expect(parts[0]!.items[0]!.exercise_id).toBe(44);
  expect(parts[0]!.items[0]!.notes).toBe('tope');
  expect(parts[0]!.items[0]!.prescription_json).toEqual(presc(5, 85));
  expect(parts[0]!.circuit).toBeUndefined();
});

test('circuitFromTemplateBlockRow keeps stored circuit and drops an empty row', () => {
  expect(
    circuitFromTemplateBlockRow({
      rounds: 4,
      pacing: 'por_tarea',
      work_seconds: null,
      rest_between_stations_seconds: 60,
      rest_between_rounds_seconds: null,
    }),
  ).toEqual({
    rounds: 4,
    pacing: { kind: 'por_tarea' },
    rest_between_stations_seconds: 60,
  });
  expect(
    circuitFromTemplateBlockRow({
      rounds: null,
      pacing: 'por_tarea',
      work_seconds: null,
      rest_between_stations_seconds: null,
      rest_between_rounds_seconds: null,
    }),
  ).toBeNull();
});

describeWithDb('copy instance to recipe — isolation (real DB)', () => {
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

  async function segsOf(templateId: number) {
    return sql<
      Array<{
        block_title: string | null;
        exercise_id: string;
        notes: string | null;
        prescription_json: unknown;
      }>
    >`
      select block_title, exercise_id::text as exercise_id, notes, prescription_json
      from template_segments
      where template_id = ${templateId}
      order by position
    `;
  }

  async function secondAthlete(fx: Fixture): Promise<number> {
    const bUser = await sql<Array<{ id: string }>>`
      insert into users (email, role)
      values (${`athB-${Date.now()}@test.local`}, 'athlete')
      returning id::text`;
    const bUserId = Number(bUser[0]!.id);
    const bRow = await sql<Array<{ id: string }>>`
      insert into athletes (user_id, coach_id, full_name)
      values (${bUserId}, ${fx.coachId}, 'Athlete B')
      returning id::text`;
    const athleteB = Number(bRow[0]!.id);
    cleanups.push(async () => {
      await sql`delete from workout_assignments where athlete_id = ${athleteB}`;
      await sql`delete from athlete_month_assignments where athlete_id = ${athleteB}`;
      await sql`delete from microcycles where athlete_id = ${athleteB}`;
      await sql`delete from athletes where id = ${athleteB}`;
      await sql`delete from users where id = ${bUserId}`;
    });
    return athleteB;
  }

  test('lands instance segments on the library recipe; sibling athlete unchanged', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const athleteB = await secondAthlete(fx);
    const exA = await makeExercise({ fx, name: 'Squat A' });
    const exB = await makeExercise({ fx, name: 'Squat B' });

    const libId = Number(
      await createTemplate({
        coach_id: fx.coachId,
        client: sql,
        payload: {
          name: 'Library leg day',
          format: 'strength_block',
          segments: [
            {
              exercise_id: exA,
              position: 0,
              block_position: 0,
              block_title: 'A',
              block_format: 'strength_block',
              prescription_json: presc(10, 60),
            },
          ],
        },
      }),
    );
    fx.templateIds.push(libId);

    const instA = (await cloneTemplateAsInstance({
      client: sql,
      source_template_id: libId,
      athlete_id: fx.athleteId,
    }))!;
    const instB = (await cloneTemplateAsInstance({
      client: sql,
      source_template_id: libId,
      athlete_id: athleteB,
    }))!;
    fx.templateIds.push(instA.template_id, instB.template_id);

    await sql`insert into workout_assignments (athlete_id, scheduled_for, template_id, template_version, status)
      values (${fx.athleteId}, ${DATE}::date, ${instA.template_id}, 1, 'scheduled')`;
    await sql`insert into workout_assignments (athlete_id, scheduled_for, template_id, template_version, status)
      values (${athleteB}, ${DATE}::date, ${instB.template_id}, 1, 'scheduled')`;

    const bBefore = await segsOf(instB.template_id);

    await updateAthleteInstanceDay({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      iso_date: DATE,
      client: sql,
      actor: ACTOR,
      payload: {
        template_id: instA.template_id,
        name: 'A edited',
        segments: [
          {
            exercise_id: exB,
            block_position: 0,
            block_title: 'EDITED',
            block_format: 'strength_block',
            prescription_json: presc(5, 85),
            notes: 'tope',
          },
        ],
      },
    });

    await expect(
      copyAthleteInstanceDayToRecipe({
        coach_id: fx.coachId,
        athlete_id: fx.athleteId,
        iso_date: DATE,
        client: sql,
        actor: ACTOR,
        payload: { template_id: instA.template_id },
      }),
    ).rejects.toMatchObject({ code: 'needs_confirm', status: 409 });

    expect(await segsOf(libId)).toHaveLength(1);
    expect((await segsOf(libId))[0]!.block_title).toBe('A');

    const result = await copyAthleteInstanceDayToRecipe({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      iso_date: DATE,
      client: sql,
      actor: ACTOR,
      payload: { template_id: instA.template_id, confirm: true },
    });
    expect(result.target).toMatchObject({ kind: 'library_template', id: libId });
    expect(result.other_athletes).toBe(1);

    const libAfter = await segsOf(libId);
    expect(libAfter).toHaveLength(1);
    expect(libAfter[0]!.block_title).toBe('EDITED');
    expect(libAfter[0]!.exercise_id).toBe(String(exB));
    expect(libAfter[0]!.notes).toBe('tope');
    expect(libAfter[0]!.prescription_json).toEqual(presc(5, 85));

    expect(await segsOf(instB.template_id)).toEqual(bBefore);
    const bAssign = await sql<Array<{ template_id: string }>>`
      select template_id::text from workout_assignments
      where athlete_id = ${athleteB} and scheduled_for = ${DATE}::date`;
    expect(bAssign[0]!.template_id).toBe(String(instB.template_id));
  });

  test('lands instance segments on the week recipe; sibling athlete unchanged', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const athleteB = await secondAthlete(fx);
    const glute = await makeExercise({ fx, name: 'Puente de glúteo' });
    const squat = await makeExercise({ fx, name: 'Sentadilla' });

    const month = await makeInlineMonthTemplate({
      fx,
      weekCount: 1,
      dayPlans: [
        {
          day_of_week: 2,
          blocks: [
            {
              title: 'Compensatorio',
              format: 'strength_block',
              items: [
                {
                  exercise_id: glute,
                  exercise_name: 'Puente de glúteo',
                  params_json: { sets: 4, reps: 12 },
                },
              ],
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
      start_date: '2026-01-05',
      client: sql,
    });
    await instantiateMonthFromTemplate({
      coach_id: fx.coachId,
      athlete_id: athleteB,
      month_template_id: month.monthId,
      start_date: '2026-01-05',
      client: sql,
    });

    const aAssign = await sql<Array<{ template_id: string }>>`
      select template_id::text from workout_assignments
      where athlete_id = ${fx.athleteId} and scheduled_for = '2026-01-06'::date`;
    const bAssign = await sql<Array<{ template_id: string }>>`
      select template_id::text from workout_assignments
      where athlete_id = ${athleteB} and scheduled_for = '2026-01-06'::date`;
    expect(aAssign).toHaveLength(1);
    expect(bAssign).toHaveLength(1);
    const instA = Number(aAssign[0]!.template_id);
    const instB = Number(bAssign[0]!.template_id);
    const bBefore = await segsOf(instB);

    await updateAthleteInstanceDay({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      iso_date: '2026-01-06',
      client: sql,
      actor: ACTOR,
      payload: {
        template_id: instA,
        name: 'Martes editado',
        segments: [
          {
            exercise_id: squat,
            block_position: 0,
            block_title: 'EDITED',
            block_format: 'strength_block',
            prescription_json: presc(5, 85),
            notes: 'desde el atleta',
          },
        ],
      },
    });

    await expect(
      copyAthleteInstanceDayToRecipe({
        coach_id: fx.coachId,
        athlete_id: fx.athleteId,
        iso_date: '2026-01-06',
        client: sql,
        actor: ACTOR,
        payload: { template_id: instA },
      }),
    ).rejects.toMatchObject({ code: 'needs_confirm', status: 409 });

    const result = await copyAthleteInstanceDayToRecipe({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      iso_date: '2026-01-06',
      client: sql,
      actor: ACTOR,
      payload: { template_id: instA, confirm: true },
    });
    expect(result.target).toMatchObject({
      kind: 'week_session',
      id: weekId,
      day_of_week: 2,
    });

    const [week] = await sql<Array<{ slots_json: { days: Array<{ day_of_week: number; sessions: Array<{
      focus?: string;
      template_id: number | null;
      blocks: Array<{ title: string; items: Array<{ exercise_id: number; notes?: string; prescription_json?: unknown }> }>;
    }> }> } }>>`
      select slots_json from program_week_templates where id = ${weekId}
    `;
    const tuesday = week!.slots_json.days.find((d) => d.day_of_week === 2);
    expect(tuesday?.sessions[0]?.template_id ?? null).toBeNull();
    expect(tuesday?.sessions[0]?.focus).toBe('Martes editado');
    expect(tuesday?.sessions[0]?.blocks[0]?.title).toBe('EDITED');
    expect(tuesday?.sessions[0]?.blocks[0]?.items[0]?.exercise_id).toBe(squat);
    expect(tuesday?.sessions[0]?.blocks[0]?.items[0]?.notes).toBe('desde el atleta');
    expect(tuesday?.sessions[0]?.blocks[0]?.items[0]?.prescription_json).toEqual(presc(5, 85));

    expect(await segsOf(instB)).toEqual(bBefore);
    const bStill = await sql<Array<{ template_id: string }>>`
      select template_id::text from workout_assignments
      where athlete_id = ${athleteB} and scheduled_for = '2026-01-06'::date`;
    expect(bStill[0]!.template_id).toBe(String(instB));
  });

  test('refuses another athlete, another coach, and a day with no recipe', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const other = await makeCoachAndAthlete(sql);
    cleanups.push(other.cleanup);
    const athleteB = await secondAthlete(fx);
    const exA = await makeExercise({ fx, name: 'Squat A' });

    const libId = Number(
      await createTemplate({
        coach_id: fx.coachId,
        client: sql,
        payload: {
          name: 'Library',
          format: 'strength_block',
          segments: [
            {
              exercise_id: exA,
              position: 0,
              block_position: 0,
              prescription_json: presc(10, 60),
            },
          ],
        },
      }),
    );
    fx.templateIds.push(libId);
    const instA = (await cloneTemplateAsInstance({
      client: sql,
      source_template_id: libId,
      athlete_id: fx.athleteId,
    }))!;
    const instB = (await cloneTemplateAsInstance({
      client: sql,
      source_template_id: libId,
      athlete_id: athleteB,
    }))!;
    fx.templateIds.push(instA.template_id, instB.template_id);
    await sql`insert into workout_assignments (athlete_id, scheduled_for, template_id, template_version, status)
      values (${fx.athleteId}, ${DATE}::date, ${instA.template_id}, 1, 'scheduled')`;
    await sql`insert into workout_assignments (athlete_id, scheduled_for, template_id, template_version, status)
      values (${athleteB}, ${DATE}::date, ${instB.template_id}, 1, 'scheduled')`;

    await expect(
      copyAthleteInstanceDayToRecipe({
        coach_id: fx.coachId,
        athlete_id: fx.athleteId,
        iso_date: DATE,
        client: sql,
        actor: ACTOR,
        payload: { template_id: instB.template_id, confirm: true },
      }),
    ).rejects.toBeInstanceOf(RecipePromoteError);

    await expect(
      copyAthleteInstanceDayToRecipe({
        coach_id: other.coachId,
        athlete_id: fx.athleteId,
        iso_date: DATE,
        client: sql,
        actor: ACTOR,
        payload: { template_id: instA.template_id, confirm: true },
      }),
    ).rejects.toBeInstanceOf(RecipePromoteError);

    const authored = await createAuthoredInstance({
      client: sql,
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      name: 'Libre',
      format: 'strength_block',
    });
    fx.templateIds.push(authored.template_id);
    await sql`insert into workout_assignments (athlete_id, scheduled_for, template_id, template_version, status)
      values (${fx.athleteId}, '2026-07-02'::date, ${authored.template_id}, 1, 'scheduled')`;

    await expect(
      copyAthleteInstanceDayToRecipe({
        coach_id: fx.coachId,
        athlete_id: fx.athleteId,
        iso_date: '2026-07-02',
        client: sql,
        actor: ACTOR,
        payload: { template_id: authored.template_id, confirm: true },
      }),
    ).rejects.toMatchObject({ code: 'no_recipe', status: 404 });

    expect(await segsOf(libId)).toHaveLength(1);
    expect((await segsOf(libId))[0]!.exercise_id).toBe(String(exA));
  });
});
