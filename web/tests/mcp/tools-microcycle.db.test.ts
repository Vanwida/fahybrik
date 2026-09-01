// create_microcycle / update_microcycle: escriben la RECETA de biblioteca, nunca
// lo entregado. Las tres puertas del día MCP (Zod → catálogo → completitud
// blocking) mandan, y un rechazo no deja un cascarón a medias.
//
// (c) reutiliza el patrón de resync-week-template.test.ts: scheduled se
// reemplaza, completed se deja.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import type { Fixture } from '../utils/db-fixtures';

const sql = getTestSql();
(globalThis as unknown as { __fahybrik_sql: unknown }).__fahybrik_sql = sql;

const { makeCoachAndAthlete, makeExercise } = await import('../utils/db-fixtures');
const { call, connectAs, errorText, payload, seedCoachLogin } = await import('../utils/mcp-client');
const { instantiateMonthFromTemplate } = await import(
  '@/lib/dashboard/coach/instantiate-program'
);

type Json = Record<string, unknown>;

const RUN_90_Z2 = {
  scheme: 'steady',
  modality: 'run',
  total_s: 5400,
  target: { kind: 'hr_zone', value: 2 },
} as const;

function squatSets(reps: number, target: Json, count: number) {
  return {
    scheme: 'sets',
    modality: 'strength',
    sets: Array.from({ length: count }, () => ({
      measure: { kind: 'reps', value: reps },
      target,
      rest_s: 150,
    })),
  };
}

const INCOMPLETE_STRENGTH = { scheme: 'sets', modality: 'strength' } as const;

/** Lunes 2-feb-2026. Martes = 3-feb. */
const MONDAY = '2026-02-02';
const TUESDAY = '2026-02-03';

describeWithDb('MCP · microciclo entero en receta (DB real)', () => {
  const cleanups: Array<() => Promise<void>> = [];
  const userIds: number[] = [];

  let clubA: Fixture;
  let clubB: Fixture;
  let coachAClerkId = '';
  let levelId = 0;
  let runExerciseId = 0;
  let squatExerciseId = 0;
  let propioExerciseId = 0;

  beforeAll(async () => {
    await sql`select 1 as ok`;
    clubA = await makeCoachAndAthlete(sql);
    clubB = await makeCoachAndAthlete(sql);
    cleanups.push(clubA.cleanup, clubB.cleanup);

    coachAClerkId = await seedCoachLogin({
      sql,
      coachId: clubA.coachId,
      tag: 'mcycle-a',
      userIds,
    });

    const levels = await sql<Array<{ id: string }>>`
      insert into athlete_levels (coach_id, name, label, sort_order)
      values (${clubA.coachId}, 'N3', 'Rendimiento', 3)
      returning id::text
    `;
    levelId = Number(levels[0]!.id);

    runExerciseId = await makeExercise({
      fx: clubA,
      name: 'Carrera continua',
      category: 'cardio',
      modality: 'run',
    });
    squatExerciseId = await makeExercise({
      fx: clubA,
      name: 'Sentadilla trasera',
      category: 'strength',
      modality: 'strength',
    });
    propioExerciseId = await makeExercise({
      fx: clubB,
      name: 'Sled push del club B',
      category: 'strength',
      modality: 'functional',
      coachId: clubB.coachId,
    });
  });

  afterAll(async () => {
    if (userIds.length > 0) {
      await sql`delete from audit_log where actor_user_id = any(${userIds}::bigint[])`;
      await sql`delete from coach_members where user_id = any(${userIds}::bigint[])`;
      await sql`delete from user_roles where user_id = any(${userIds}::bigint[])`;
      await sql`delete from users where id = any(${userIds}::bigint[])`;
    }
    while (cleanups.length) await cleanups.pop()!();
    await closeTestSql();
  });

  async function countLibraryMonths(coachId: number): Promise<number> {
    const rows = await sql<Array<{ n: number }>>`
      select count(*)::int as n from program_month_templates
      where coach_id = ${coachId} and athlete_id is null
    `;
    return rows[0]!.n;
  }

  async function countCoachWeeks(coachId: number): Promise<number> {
    const rows = await sql<Array<{ n: number }>>`
      select count(*)::int as n from program_week_templates where coach_id = ${coachId}
    `;
    return rows[0]!.n;
  }

  test('las dos tools se anuncian y escriben (no son de solo lectura)', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const { tools } = await client.listTools();
      const byName = new Map(tools.map((t) => [t.name, t]));
      for (const name of ['create_microcycle', 'update_microcycle']) {
        expect(byName.has(name), `falta ${name}`).toBe(true);
        expect(byName.get(name)!.annotations?.readOnlyHint).toBe(false);
        expect(byName.get(name)!.description).toContain('prescription.scheme');
      }
    } finally {
      await close();
    }
  });

  test('create_microcycle con completitud incompleta falla entero: nada a medias', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const monthsBefore = await countLibraryMonths(clubA.coachId);
      const weeksBefore = await countCoachWeeks(clubA.coachId);

      const text = errorText(
        await call(client, 'create_microcycle', {
          name: 'Base aeróbica',
          level_id: levelId,
          weeks: [
            {
              focus: 'Volumen',
              days: [
                {
                  weekday: 1,
                  title: 'Rodaje',
                  blocks: [
                    {
                      title: 'Rodaje',
                      items: [{ exercise_id: runExerciseId, prescription: RUN_90_Z2 }],
                    },
                  ],
                },
              ],
            },
            {
              focus: 'Fuerza',
              days: [
                {
                  weekday: 2,
                  title: 'Fuerza',
                  blocks: [
                    {
                      title: 'Principal',
                      items: [
                        {
                          exercise_id: squatExerciseId,
                          prescription: INCOMPLETE_STRENGTH,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      );

      expect(text).toContain('No he escrito nada');
      expect(text).toContain('Sentadilla trasera');
      expect(await countLibraryMonths(clubA.coachId)).toBe(monthsBefore);
      expect(await countCoachWeeks(clubA.coachId)).toBe(weeksBefore);
    } finally {
      await close();
    }
  });

  test('create_microcycle con exercise_id fuera de catálogo falla y no crea receta', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const monthsBefore = await countLibraryMonths(clubA.coachId);

      const text = errorText(
        await call(client, 'create_microcycle', {
          name: 'Sled ajeno',
          level_id: levelId,
          weeks: [
            {
              days: [
                {
                  weekday: 1,
                  title: 'Sled',
                  blocks: [
                    {
                      title: 'Sled',
                      items: [
                        {
                          exercise_id: propioExerciseId,
                          prescription: {
                            scheme: 'rounds',
                            modality: 'functional',
                            rounds: 4,
                            sets: [{ measure: { kind: 'distance', meters: 25 } }],
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      );

      expect(text).toContain('no existen o no son tuyos');
      expect(text).toContain('search_library');
      expect(text).not.toContain('Sled push del club B');
      expect(await countLibraryMonths(clubA.coachId)).toBe(monthsBefore);
    } finally {
      await close();
    }
  });

  test('update sobre microciclo con linaje resincroniza solo scheduled y deja completed intacto', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const created = payload(
        await call(client, 'create_microcycle', {
          name: 'Fuerza + rodaje',
          level_id: levelId,
          weeks: [
            {
              focus: 'Semana 1',
              days: [
                {
                  weekday: 1,
                  title: 'Fuerza',
                  blocks: [
                    {
                      title: 'Fuerza',
                      items: [
                        {
                          exercise_id: squatExerciseId,
                          prescription: squatSets(5, { kind: 'percent_rm', value: 75 }, 3),
                        },
                      ],
                    },
                  ],
                },
                {
                  weekday: 2,
                  title: 'Rodaje',
                  blocks: [
                    {
                      title: 'Rodaje',
                      items: [{ exercise_id: runExerciseId, prescription: RUN_90_Z2 }],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      );

      const microcycleId = Number(created.microcycle_id);
      expect(Number.isFinite(microcycleId)).toBe(true);
      clubA.monthTemplates.push({
        monthId: microcycleId,
        weekIds: ((created.weeks as Array<{ week_template_id: string }>) ?? []).map((w) =>
          Number(w.week_template_id),
        ),
      });

      const monthRow = await sql<Array<{ athlete_id: string | null }>>`
        select athlete_id::text as athlete_id from program_month_templates
        where id = ${microcycleId}
      `;
      expect(monthRow[0]!.athlete_id).toBeNull();

      const assignmentsBeforeCreate = await sql<Array<{ n: number }>>`
        select count(*)::int as n from workout_assignments where athlete_id = ${clubA.athleteId}
      `;
      expect(assignmentsBeforeCreate[0]!.n).toBe(0);

      const audit = await sql<Array<{ action: string; channel: string }>>`
        select action::text as action, channel from audit_log
        where entity_type = 'program_month_templates' and entity_id = ${microcycleId}
          and channel = 'mcp'
      `;
      expect(audit.length).toBeGreaterThanOrEqual(1);
      expect(audit[0]).toMatchObject({ action: 'create', channel: 'mcp' });

      await instantiateMonthFromTemplate({
        coach_id: clubA.coachId,
        athlete_id: clubA.athleteId,
        month_template_id: microcycleId,
        start_date: MONDAY,
        client: sql,
      });

      const mondayBefore = await sql<Array<{ id: string; template_id: string; status: string }>>`
        select id::text, template_id::text, status::text from workout_assignments
        where athlete_id = ${clubA.athleteId} and scheduled_for = ${MONDAY}::date
        order by id
      `;
      const tuesdayBefore = await sql<Array<{ id: string; template_id: string; status: string }>>`
        select id::text, template_id::text, status::text from workout_assignments
        where athlete_id = ${clubA.athleteId} and scheduled_for = ${TUESDAY}::date
        order by id
      `;
      expect(mondayBefore.length).toBeGreaterThanOrEqual(1);
      expect(tuesdayBefore.length).toBeGreaterThanOrEqual(1);
      const mondayAssignment = mondayBefore[0]!;
      const tuesdayAssignment = tuesdayBefore[0]!;
      expect(mondayAssignment.status).toBe('scheduled');
      expect(tuesdayAssignment.status).toBe('scheduled');

      await sql`
        update workout_assignments set status = 'completed'::assignment_status
        where id = ${Number(mondayAssignment.id)}
      `;

      const updated = payload(
        await call(client, 'update_microcycle', {
          microcycle_id: microcycleId,
          weeks: [
            {
              focus: 'Semana 1 tocada',
              days: [
                {
                  weekday: 1,
                  title: 'Fuerza',
                  blocks: [
                    {
                      title: 'Fuerza',
                      items: [
                        {
                          exercise_id: squatExerciseId,
                          prescription: squatSets(3, { kind: 'percent_rm', value: 80 }, 5),
                          notes: 'Cambio que NO debe llegar a lo ya hecho',
                        },
                      ],
                    },
                  ],
                },
                {
                  weekday: 2,
                  title: 'Rodaje',
                  blocks: [
                    {
                      title: 'Rodaje',
                      items: [
                        {
                          exercise_id: runExerciseId,
                          prescription: RUN_90_Z2,
                          notes: 'Nota nueva para el scheduled',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      );

      expect(Number(updated.microcycle_id)).toBe(microcycleId);

      const mondayAfter = await sql<Array<{ id: string; template_id: string; status: string }>>`
        select id::text, template_id::text, status::text from workout_assignments
        where id = ${Number(mondayAssignment.id)}
      `;
      expect(mondayAfter[0]!.status).toBe('completed');
      expect(mondayAfter[0]!.template_id).toBe(mondayAssignment.template_id);

      const mondayNotes = await sql<Array<{ notes: string | null }>>`
        select notes from template_segments
        where template_id = ${Number(mondayAssignment.template_id)}
      `;
      expect(mondayNotes.every((r) => r.notes !== 'Cambio que NO debe llegar a lo ya hecho')).toBe(
        true,
      );

      const tuesdayAfter = await sql<Array<{ id: string; template_id: string; status: string }>>`
        select id::text, template_id::text, status::text from workout_assignments
        where id = ${Number(tuesdayAssignment.id)}
      `;
      expect(tuesdayAfter[0]!.id).toBe(tuesdayAssignment.id);
      expect(tuesdayAfter[0]!.status).toBe('scheduled');
      expect(tuesdayAfter[0]!.template_id).not.toBe(tuesdayAssignment.template_id);

      const tueNotes = await sql<Array<{ notes: string | null }>>`
        select notes from template_segments
        where template_id = ${Number(tuesdayAfter[0]!.template_id)}
      `;
      expect(tueNotes.some((r) => r.notes === 'Nota nueva para el scheduled')).toBe(true);
    } finally {
      await close();
    }
  });

  test('el título del entreno no se copia del primer bloque', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const created = payload(
        await call(client, 'create_microcycle', {
          name: 'Upper + warmup',
          level_id: levelId,
          weeks: [
            {
              days: [
                {
                  weekday: 2,
                  title: 'Fuerza tren superior + core',
                  blocks: [
                    {
                      title: 'Warm up',
                      format: 'warmup',
                      items: [
                        {
                          exercise_id: squatExerciseId,
                          prescription: {
                            scheme: 'warmup',
                            modality: 'strength',
                            sets: [{ measure: { kind: 'reps', value: 8 } }],
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      );

      const microcycleId = Number(created.microcycle_id);
      clubA.monthTemplates.push({
        monthId: microcycleId,
        weekIds: ((created.weeks as Array<{ week_template_id: string }>) ?? []).map((w) =>
          Number(w.week_template_id),
        ),
      });

      const day = (created.weeks as Array<{ days: Array<Json> }>)[0]?.days[0] as Json;
      expect(day.title).toBe('Fuerza tren superior + core');
      const block = (day.blocks as Json[])[0]!;
      expect(block.title).toBe('Warm up');
      expect(block.format).toBe('warmup');

      const weekId = Number(
        (created.weeks as Array<{ week_template_id: string }>)[0]!.week_template_id,
      );
      const rows = await sql<Array<{ slots_json: { days: Array<Json> } }>>`
        select slots_json from program_week_templates where id = ${weekId}
      `;
      const tuesday = rows[0]!.slots_json.days.find((d) => d.day_of_week === 2) as Json;
      const session = (tuesday.sessions as Json[])[0]!;
      expect(session.focus).toBe('Fuerza tren superior + core');
      expect((session.blocks as Json[])[0]!.title).toBe('Warm up');
      expect((session.blocks as Json[])[0]!.format).toBe('warmup');
    } finally {
      await close();
    }
  });
});
