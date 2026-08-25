/**
 * Confirm de un ciclo: escribe un upload SINTÉTICO del coach de prueba
 * y lo borra. NUNCA el macrociclo real de 12 semanas.
 */
import { afterAll, beforeAll, expect, test } from 'vitest';
import { confirmCycleImport } from '@/lib/import/cycle-confirm';
import { ImportError } from '@/lib/import/import-shared';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';

type Sql = ReturnType<typeof getTestSql>;
const SEED_COACH_ID = Number(process.env.SEED_COACH_ID ?? 29);
const RUN = `CYCLE-IMPORT-TEST-${Date.now()}`;

function sessionWith(exerciseId: number) {
  return {
    uid: 'ses-1',
    slot: 'am' as const,
    focus: 'Fuerza',
    blocks: [
      {
        uid: 'blk-1',
        title: 'Fuerza',
        format: 'sets',
        coach_note: 'linea suelta que no se tipó',
        items: [
          {
            uid: 'it-1',
            exercise_id: exerciseId,
            exercise_name: 'Back Squat',
            prescription: {
              scheme: 'sets',
              modality: 'strength',
              sets: [
                { measure: { kind: 'reps', value: 5 }, target: { kind: 'percent_rm', value: 70 } },
              ],
            },
          },
        ],
      },
    ],
  };
}

describeWithDb('confirm de ciclo — upload sintético, no el ciclo real', () => {
  let sql: Sql;
  let exerciseId = 0;
  let createdMonthId = 0;

  beforeAll(async () => {
    sql = getTestSql();
    const ex = await sql<Array<{ id: string }>>`select id::text from exercises order by id asc limit 1`;
    exerciseId = Number(ex[0]!.id);
  });

  afterAll(async () => {
    const leftover = await sql<Array<{ id: string }>>`
      select id::text from program_month_templates
      where coach_id = ${SEED_COACH_ID} and name like ${`${RUN}%`}
    `;
    for (const row of leftover) {
      const weeks = await sql<Array<{ id: string }>>`
        select week_template_id::text as id from program_month_weeks
        where month_template_id = ${Number(row.id)}
      `;
      await sql`delete from program_month_weeks where month_template_id = ${Number(row.id)}`;
      for (const w of weeks) {
        await sql`delete from program_week_templates where id = ${Number(w.id)}`;
      }
      await sql`delete from program_month_templates where id = ${Number(row.id)}`;
    }
    await closeTestSql();
  });

  test('cobertura baja: no se crea ningún ciclo', async () => {
    await expect(
      confirmCycleImport({
        coach_id: SEED_COACH_ID,
        client: sql,
        body: {
          mode: 'cycle',
          name: `${RUN}-bloqueado`,
          source_summary: { total_items: 10, detected: 4 },
          weeks: [
            {
              week_index: 0,
              day_of_week: 1,
              sessions: [sessionWith(exerciseId)],
            },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: 'coverage_below_threshold' });

    const rows = await sql<Array<{ n: string }>>`
      select count(*)::text as n from program_month_templates
      where coach_id = ${SEED_COACH_ID} and name = ${`${RUN}-bloqueado`}
    `;
    expect(Number(rows[0]!.n)).toBe(0);
  });

  test('cobertura al trinquete: escribe UN día sintético y no el corpus de 12 semanas', async () => {
    const result = await confirmCycleImport({
      coach_id: SEED_COACH_ID,
      client: sql,
      body: {
        mode: 'cycle',
        name: RUN,
        source_summary: { total_items: 1238, detected: 884 },
        weeks: [
          {
            week_index: 0,
            day_of_week: 1,
            sessions: [sessionWith(exerciseId)],
            notes: 'nota declarada del dia',
          },
        ],
      },
    });
    createdMonthId = Number(result.microcycle_id);
    expect(result.written).toHaveLength(1);

    const months = await sql<Array<{ name: string }>>`
      select name from program_month_templates where id = ${createdMonthId}
    `;
    expect(months[0]!.name).toBe(RUN);
    expect(months[0]!.name.toLowerCase()).not.toContain('acumulacion');

    const weekCount = await sql<Array<{ n: string }>>`
      select count(*)::text as n from program_month_weeks
      where month_template_id = ${createdMonthId}
    `;
    expect(Number(weekCount[0]!.n)).toBe(1);

    const week = await sql<Array<{ slots: unknown }>>`
      select w.slots_json as slots
      from program_week_templates w
      join program_month_weeks j on j.week_template_id = w.id
      where j.month_template_id = ${createdMonthId}
      limit 1
    `;
    const slots = week[0]!.slots as { days?: Array<{ sessions?: unknown[] }> };
    const sessionDays = (slots.days ?? []).filter((d) => (d.sessions?.length ?? 0) > 0);
    expect(sessionDays).toHaveLength(1);
  });

  test('el error de cobertura es ImportError, no un 500', async () => {
    try {
      await confirmCycleImport({
        coach_id: SEED_COACH_ID,
        client: sql,
        body: {
          mode: 'cycle',
          name: `${RUN}-x`,
          source_summary: { total_items: 20, detected: 1 },
          weeks: [{ week_index: 0, day_of_week: 2, sessions: [sessionWith(exerciseId)] }],
        },
      });
      throw new Error('tenía que fallar');
    } catch (err) {
      expect(err).toBeInstanceOf(ImportError);
      expect((err as ImportError).status).toBe(400);
    }
  });
});
