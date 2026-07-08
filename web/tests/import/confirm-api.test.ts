/**
 * Real-DB API-level test for the #28 CONFIRM service (the /confirm route's core).
 * Creates a throwaway microcycle + one empty week template owned by the seed
 * coach, then asserts:
 *   1) an approved day WRITES into the mapped week template (the #33 shape lands);
 *   2) a resolved token is LEARNED into coach_exercise_synonyms;
 *   3) an unresolved line (exercise_id null) REJECTS the whole confirm (nothing saved);
 *   4) a target week not in the microcycle is refused (Fork B ownership).
 * All fixtures are torn down. Skips loudly without TEST_DATABASE_URL.
 */
import { afterAll, beforeAll, expect, test } from 'vitest';
import { confirmImport } from '@/lib/import/confirm-service';
import { ImportError } from '@/lib/import/proposal-service';
import { getWeekTemplate } from '@/lib/dashboard/coach/program-weeks';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';

type Sql = ReturnType<typeof getTestSql>;
const SEED_COACH_ID = Number(process.env.SEED_COACH_ID ?? 29);
const LEARN_TERM = `import-test-token-${Date.now()}`;

function sessionWith(exerciseId: number | null) {
  return {
    uid: 'ses-1',
    slot: 'am' as const,
    focus: 'Fuerza inferior',
    blocks: [
      {
        uid: 'blk-1',
        title: 'Sentadilla',
        format: 'sets',
        items: [
          {
            uid: 'it-1',
            exercise_id: exerciseId,
            exercise_name: exerciseId === null ? 'bar zercher jump' : 'Back Squat',
            prescription: {
              scheme: 'sets',
              modality: 'strength',
              sets: [
                { measure: { kind: 'reps', value: 5 }, target: { kind: 'percent_rm', value: 70 } },
                { measure: { kind: 'reps', value: 5 }, target: { kind: 'percent_rm', value: 75 } },
              ],
            },
          },
        ],
      },
    ],
  };
}

describeWithDb('#28 confirm service — write approved days (real DB)', () => {
  let sql: Sql;
  let microcycleId = 0;
  let weekId = 0;
  let exerciseId = 0;

  beforeAll(async () => {
    sql = getTestSql();

    const ex = await sql<Array<{ id: string }>>`select id::text from exercises order by id asc limit 1`;
    exerciseId = Number(ex[0]!.id);

    const month = await sql<Array<{ id: string }>>`
      insert into program_month_templates (coach_id, name)
      values (${SEED_COACH_ID}, ${`IMPORT-CONFIRM-TEST-${Date.now()}`})
      returning id::text
    `;
    microcycleId = Number(month[0]!.id);

    const week = await sql<Array<{ id: string }>>`
      insert into program_week_templates (coach_id, name, slots_json)
      values (${SEED_COACH_ID}, ${'IMPORT-CONFIRM-WK'}, ${sql.json({ days: [] })})
      returning id::text
    `;
    weekId = Number(week[0]!.id);

    await sql`
      insert into program_month_weeks (month_template_id, week_template_id, position)
      values (${microcycleId}, ${weekId}, 0)
    `;
  });

  afterAll(async () => {
    if (weekId) await sql`delete from program_month_weeks where week_template_id = ${weekId}`;
    if (weekId) await sql`delete from program_week_templates where id = ${weekId}`;
    if (microcycleId) await sql`delete from program_month_templates where id = ${microcycleId}`;
    await sql`delete from coach_exercise_synonyms where coach_id = ${SEED_COACH_ID} and term_normalized = ${LEARN_TERM}`;
    await closeTestSql();
  });

  test('writes the approved day into the mapped week + learns the resolved token', async () => {
    const result = await confirmImport({
      coach_id: SEED_COACH_ID,
      body: {
        microcycle_id: microcycleId,
        weeks: [{ target_week_template_id: weekId, day_of_week: 2, session: sessionWith(exerciseId) }],
        synonyms: [{ term: LEARN_TERM, exercise_id: exerciseId }],
      },
      client: sql,
    });

    expect(result.written).toEqual([{ week_template_id: String(weekId), days: [2] }]);
    expect(result.learned).toBe(1);

    // The day actually LANDED in the week template's slots_json (the #33 shape).
    const week = await getWeekTemplate({ coach_id: SEED_COACH_ID, id: weekId, client: sql });
    const day = week!.slots_json.days.find((d) => d.day_of_week === 2);
    expect(day).toBeTruthy();
    const item = day!.sessions[0]!.blocks![0]!.items[0]!;
    expect(Number(item.exercise_id)).toBe(exerciseId);
    expect(item.prescription_json?.scheme).toBe('sets');

    // The synonym was learned for this coach (aprende su notación).
    const syn = await sql<Array<{ exercise_id: string }>>`
      select exercise_id::text from coach_exercise_synonyms
      where coach_id = ${SEED_COACH_ID} and term_normalized = ${LEARN_TERM} limit 1
    `;
    expect(syn[0]).toBeTruthy();
    expect(Number(syn[0]!.exercise_id)).toBe(exerciseId);
  });

  test('rejects a confirm with an unresolved line — nothing saved (sacred rule)', async () => {
    let thrown: unknown;
    try {
      await confirmImport({
        coach_id: SEED_COACH_ID,
        body: {
          microcycle_id: microcycleId,
          weeks: [{ target_week_template_id: weekId, day_of_week: 4, session: sessionWith(null) }],
        },
        client: sql,
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ImportError);
    expect((thrown as ImportError).code).toBe('unresolved_lines');
    expect((thrown as ImportError).status).toBe(400);

    // Day 4 was never written (the reject fired before any write).
    const week = await getWeekTemplate({ coach_id: SEED_COACH_ID, id: weekId, client: sql });
    expect(week!.slots_json.days.find((d) => d.day_of_week === 4)).toBeUndefined();
  });

  test('refuses a target week outside the microcycle (Fork B ownership)', async () => {
    await expect(
      confirmImport({
        coach_id: SEED_COACH_ID,
        body: {
          microcycle_id: microcycleId,
          weeks: [
            { target_week_template_id: 2_000_000_000, day_of_week: 3, session: sessionWith(exerciseId) },
          ],
        },
        client: sql,
      }),
    ).rejects.toMatchObject({ code: 'invalid_target', status: 400 });
  });
});
