// `get_plan` y `get_session`, habladas por un cliente MCP de verdad contra la DB.
//
// Estas dos tools son la cadena que usa el coach: pide la semana, ve qué hay cada
// día con su session_id, y pide el detalle de la que le interesa. Lo que se prueba
// aquí es justamente esa cadena — que el id que sale de una entra en la otra — más
// las dos formas de pedir una sesión (por fecha, como habla él, y por id) y el
// caso de doble sesión, donde adivinar sería peor que preguntar.
//
// Y el caso cruzado, que es el que importa: el club B pidiendo el plan o una sesión
// del atleta del club A se lleva un error legible y NI UN DATO.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeAssignment,
  makeCoachAndAthlete,
  makeExercise,
  makeTemplate,
  type Fixture,
} from '../utils/db-fixtures';
import { call, connectAs, errorText, payload, seedCoachLogin } from '../utils/mcp-client';

/** Lunes de la semana que se siembra, y el miércoles desde el que se ancla. */
const WEEK_MONDAY = '2026-08-03';
const WEDNESDAY = '2026-08-05';
const THURSDAY = '2026-08-06';
const FRIDAY = '2026-08-07';

type Json = Record<string, unknown>;
type PlanDay = { iso_date: string; sessions: Json[] };

describeWithDb('MCP · get_plan y get_session (DB real)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];
  const userIds: number[] = [];

  let clubA: Fixture;
  let clubB: Fixture;
  let coachAClerkId = '';
  let coachBClerkId = '';

  let runAssignmentId = 0;
  let strengthAssignmentId = 0;
  let amAssignmentId = 0;
  let pmAssignmentId = 0;

  beforeAll(async () => {
    await sql`select 1 as ok`;
    clubA = await makeCoachAndAthlete(sql);
    clubB = await makeCoachAndAthlete(sql);
    cleanups.push(clubA.cleanup, clubB.cleanup);

    coachAClerkId = await seedCoachLogin({ sql, coachId: clubA.coachId, tag: 'plan-a', userIds });
    coachBClerkId = await seedCoachLogin({ sql, coachId: clubB.coachId, tag: 'plan-b', userIds });

    const runId = await makeExercise({
      fx: clubA,
      name: 'Carrera',
      category: 'cardio',
      modality: 'run',
    });
    const squatId = await makeExercise({
      fx: clubA,
      name: 'Sentadilla',
      category: 'strength',
      modality: 'strength',
    });

    // Miércoles: series de 1000, ya hechas y medidas.
    const runTemplate = await makeTemplate({
      fx: clubA,
      name: 'Series 4×1000',
      format: 'intervals',
    });
    const runSegments = await sql<Array<{ id: string }>>`
      insert into template_segments (
        template_id, position, block_position, block_format, block_title,
        exercise_id, params_json, prescription_json
      )
      values (
        ${runTemplate}, 0, 0, 'intervals', 'Series',
        ${runId},
        ${sql.json({ distance_meters: 1000, sets: 4 })},
        ${sql.json({
          scheme: 'intervals',
          modality: 'run',
          sets: [0, 1, 2, 3].map(() => ({
            measure: { kind: 'distance', meters: 1000 },
            target: { kind: 'pace', unit: 'per_km', min_s: 240, max_s: 250 },
            rest_s: 120,
          })),
        })}
      )
      returning id::text as id
    `;
    runAssignmentId = await makeAssignment({
      fx: clubA,
      templateId: runTemplate,
      scheduledForIso: WEDNESDAY,
      status: 'completed',
      notes: 'coach_title: Calidad de carrera',
    });
    const exec = await sql<Array<{ id: string }>>`
      insert into workout_executions (
        assignment_id, athlete_id, started_at, ended_at, total_duration_seconds, perceived_exertion
      )
      values (
        ${runAssignmentId}, ${clubA.athleteId},
        ${`${WEDNESDAY}T07:00:00Z`}, ${`${WEDNESDAY}T07:58:00Z`}, 3480, 8
      )
      returning id::text as id
    `;
    // Un lap dentro de banda (4:05) y uno lento (5:00): el veredicto tiene que
    // salir de los dos signos, no solo del feliz.
    await sql`
      insert into segment_executions (
        execution_id, template_segment_id, position, modality, started_at, ended_at,
        distance_meters, avg_pace_s_per_km, avg_hr, source
      )
      values
        (
          ${Number(exec[0]!.id)}, ${Number(runSegments[0]!.id)}, 0, 'run',
          ${`${WEDNESDAY}T07:10:00Z`}, ${`${WEDNESDAY}T07:14:05Z`}, 1000, 245, 170, 'gps'
        ),
        (
          ${Number(exec[0]!.id)}, ${Number(runSegments[0]!.id)}, 1, 'run',
          ${`${WEDNESDAY}T07:20:00Z`}, ${`${WEDNESDAY}T07:25:00Z`}, 1000, 300, 165, 'gps'
        )
    `;

    // Jueves: fuerza por hacer, con dosis de %RM (el otro formateador).
    const strengthTemplate = await makeTemplate({
      fx: clubA,
      name: 'Fuerza A',
      format: 'strength_block',
    });
    await sql`
      insert into template_segments (
        template_id, position, block_position, block_format, block_title,
        exercise_id, params_json, prescription_json
      )
      values (
        ${strengthTemplate}, 0, 0, 'strength_block', 'Principal',
        ${squatId},
        ${sql.json({ sets: 5, reps: 5, load_pct: 75, rest_seconds: 150 })},
        ${sql.json({
          scheme: 'sets',
          modality: 'strength',
          sets: [0, 1, 2, 3, 4].map(() => ({
            measure: { kind: 'reps', value: 5 },
            target: { kind: 'percent_rm', value: 75 },
            rest_s: 150,
          })),
        })}
      )
    `;
    strengthAssignmentId = await makeAssignment({
      fx: clubA,
      templateId: strengthTemplate,
      scheduledForIso: THURSDAY,
      status: 'scheduled',
    });

    // Viernes: doble sesión, para que la tool tenga que preguntar cuál.
    amAssignmentId = await makeAssignment({
      fx: clubA,
      templateId: runTemplate,
      scheduledForIso: FRIDAY,
      status: 'scheduled',
      notes: 'slot: am',
    });
    pmAssignmentId = await makeAssignment({
      fx: clubA,
      templateId: strengthTemplate,
      scheduledForIso: FRIDAY,
      status: 'scheduled',
      notes: 'slot: pm',
    });
  });

  afterAll(async () => {
    if (userIds.length > 0) {
      await sql`delete from coach_members where user_id = any(${userIds}::bigint[])`;
      await sql`delete from user_roles where user_id = any(${userIds}::bigint[])`;
      await sql`delete from users where id = any(${userIds}::bigint[])`;
    }
    while (cleanups.length) await cleanups.pop()!();
    await closeTestSql();
  });

  test('get_plan week: los siete días, y cada sesión con su id, su estado y de qué va', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const body = payload(
        await call(client, 'get_plan', {
          athlete_id: clubA.athleteId,
          view: 'week',
          anchor: WEDNESDAY,
        }),
      );
      const plan = body.plan as Json;

      expect(plan.athlete_name).toBe('Test Athlete');
      expect(plan.view).toBe('week');
      const week = plan.week as { week_start: string; week_end: string; days: PlanDay[] };
      expect(week.week_start).toBe(WEEK_MONDAY);
      expect(week.week_end).toBe('2026-08-09');
      // La semana entera, descansos incluidos: un hueco es una respuesta.
      expect(week.days).toHaveLength(7);
      expect(week.days.filter((d) => d.sessions.length === 0)).toHaveLength(4);

      const wed = week.days.find((d) => d.iso_date === WEDNESDAY)!;
      expect(wed.sessions).toHaveLength(1);
      const runSession = wed.sessions[0]!;
      // El id con el que se encadena a get_session.
      expect(runSession.assignment_id).toBe(String(runAssignmentId));
      // El título por-asignación del coach gana al nombre de la plantilla.
      expect(runSession.title).toBe('Calidad de carrera');
      expect(runSession.status).toBe('completed');
      expect(runSession.status_es).toBe('hecha');
      expect(runSession.rpe).toBe(8);

      // Y de qué va, con la dosis escrita por el formateador del dominio.
      const content = runSession.content as { lines: string[]; exercise_count: number };
      expect(content.exercise_count).toBe(1);
      expect(content.lines[0]).toBe("Carrera 4×1000m @ 4:00-4:10/km · r2'");

      const thu = week.days.find((d) => d.iso_date === THURSDAY)!;
      const strengthContent = thu.sessions[0]!.content as { lines: string[] };
      expect(strengthContent.lines[0]).toBe("Sentadilla 5×5 @ 75% RM · descanso 2'30''");
      expect(thu.sessions[0]!.status_es).toBe('por hacer');

      // Sin microciclo asignado no hay estado de publicación que inventar.
      expect(plan.publish).toBeNull();
      expect(body._resumen as string).toContain('Test Athlete');
      expect(body._resumen as string).toContain('4 sesiones');
    } finally {
      await close();
    }
  });

  test('get_plan macro: los tramos del plan, sin la rejilla de días', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const body = payload(
        await call(client, 'get_plan', { athlete_id: clubA.athleteId, view: 'macro' }),
      );
      const plan = body.plan as Json;

      expect(plan.view).toBe('macro');
      const macro = plan.macro as Json;
      for (const key of ['blocks', 'assignments', 'weeks', 'total_assigned_weeks']) {
        expect(macro, `falta ${key}`).toHaveProperty(key);
      }
      // El macro contesta por semanas y tramos: los días no viajan.
      expect(plan).not.toHaveProperty('week');
      expect(plan).not.toHaveProperty('weeks');
      // Este atleta no tiene microciclo asignado, y se dice sin inventar nada.
      expect(macro.total_assigned_weeks).toBe(0);
      expect(macro.assignments).toEqual([]);
      expect(body._resumen as string).toContain('sin microciclo activo');
    } finally {
      await close();
    }
  });

  test('get_session por fecha con una sola sesión: el detalle entero', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const body = payload(
        await call(client, 'get_session', { athlete_id: clubA.athleteId, date: WEDNESDAY }),
      );
      const session = body.session as Json;

      expect(session.assignment_id).toBe(String(runAssignmentId));
      expect(session.iso_date).toBe(WEDNESDAY);
      expect(session.date_es).toBe('5 de agosto');
      expect(session.title).toBe('Calidad de carrera');
      expect(session.content_state).toBe('blocks');

      // Prescrito: la dosis escrita, nunca el prescription_json en crudo.
      const prescribed = session.prescribed as { blocks: Array<{ items: Json[] }> };
      const item = prescribed.blocks[0]!.items[0]!;
      expect(item.exercise).toBe('Carrera');
      // La dosis NARRA la estructura desde 86f479d0 (trabajo y recuperación con
      // su medida): la grafía fina es la correcta, la plana era la degradación.
      expect(item.dose).toBe("4×(1000m @ 4:00-4:10/km / r2')");
      expect(JSON.stringify(session)).not.toContain('prescription_json');

      // Ejecutado: lo que hizo de verdad.
      expect(session.executed).toMatchObject({ duration_min: 58, rpe: 8 });

      // Y tramo a tramo, con el veredicto de cada uno contra su banda.
      const tramos = session.tramos as Array<Json>;
      expect(tramos).toHaveLength(2);
      expect(tramos[0]!.verdict).toBe('dentro');
      expect(tramos[1]!.verdict).toBe('fuera_lento');
      expect(tramos[0]!.prescribed).toBe("4×1000m @ 4:00-4:10/km · r2'");
      const executed = tramos[0]!.executed as Json;
      // Duración en la notación atlética del dominio (4'05''), ritmo en reloj
      // (4:05/km) — las dos mitades se leen como en el resto de la app.
      expect(executed.label).toBe("1 km · 4'05'' · 4:05/km · 170 ppm");
      // Un tramo de carrera no lleva kg ni watios: lo que no se midió no viaja.
      expect(executed).not.toHaveProperty('weight_kg');
      expect(executed).not.toHaveProperty('power_w');

      expect(session.compliance).toMatchObject({
        pct_in_band: 50,
        in_band: 1,
        too_slow: 1,
        evaluable: 2,
        total: 2,
      });
      expect(body._resumen as string).toContain('50% de 2 tramos en banda');
    } finally {
      await close();
    }
  });

  test('get_session por fecha con doble sesión: la lista corta para elegir', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const body = payload(
        await call(client, 'get_session', { athlete_id: clubA.athleteId, date: FRIDAY }),
      );

      expect(body.session).toBeUndefined();
      const sessions = body.sessions as Json[];
      expect(sessions).toHaveLength(2);
      expect(sessions.map((s) => s.assignment_id).sort()).toEqual(
        [String(amAssignmentId), String(pmAssignmentId)].sort(),
      );
      // Cada opción trae de qué va, para poder elegir sin pedir las dos.
      for (const s of sessions) expect(s.content).not.toBeNull();
      expect(body._resumen as string).toContain('2 sesiones el 7 de agosto');
    } finally {
      await close();
    }
  });

  test('get_session de un día sin nada: se dice, y no es un error', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const res = await call(client, 'get_session', {
        athlete_id: clubA.athleteId,
        date: WEEK_MONDAY,
      });
      const body = payload(res);

      expect(res.isError).not.toBe(true);
      expect(body.sessions).toEqual([]);
      expect(body._resumen as string).toContain('no tiene nada programado');
    } finally {
      await close();
    }
  });

  test('get_session por session_id: el mismo detalle que por fecha', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const body = payload(
        await call(client, 'get_session', {
          athlete_id: clubA.athleteId,
          session_id: strengthAssignmentId,
        }),
      );
      const session = body.session as Json;
      expect(session.iso_date).toBe(THURSDAY);
      expect(session.title).toBe('Fuerza A');
      // Sin ejecución no se fabrica ninguna: por hacer es por hacer.
      expect(session.executed).toBeNull();
      const tramos = session.tramos as Json[];
      expect(tramos).toHaveLength(1);
      expect(tramos[0]!.executed).toBeNull();
      expect(tramos[0]!.prescribed).toBe("5×5 @ 75% RM · descanso 2'30''");
    } finally {
      await close();
    }
  });

  test('get_session sin fecha ni id: dice qué le falta', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const text = errorText(await call(client, 'get_session', { athlete_id: clubA.athleteId }));
      expect(text).toContain('date');
      expect(text).toContain('session_id');
    } finally {
      await close();
    }
  });

  test('get_session con un id que no es de ese atleta: manda a get_plan, no a la lista', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const text = errorText(
        await call(client, 'get_session', {
          athlete_id: clubA.athleteId,
          session_id: 2_147_483_600,
        }),
      );
      expect(text).toContain('get_plan');
    } finally {
      await close();
    }
  });

  test('cruzado: el club B pide el plan del atleta de A → error legible y cero datos', async () => {
    const { client, close } = await connectAs(coachBClerkId);
    try {
      const res = await call(client, 'get_plan', {
        athlete_id: clubA.athleteId,
        view: 'week',
        anchor: WEDNESDAY,
      });
      const text = errorText(res);
      expect(text).toContain('No hay ningún atleta tuyo con ese identificador');
      expect(text).not.toContain('Calidad de carrera');
      expect(text).not.toContain('Test Athlete');
      expect(res.structuredContent).toBeUndefined();
    } finally {
      await close();
    }
  });

  test('cruzado: el club B pide una sesión del atleta de A, por fecha y por id', async () => {
    const { client, close } = await connectAs(coachBClerkId);
    try {
      for (const args of [
        { athlete_id: clubA.athleteId, date: WEDNESDAY },
        { athlete_id: clubA.athleteId, session_id: runAssignmentId },
      ]) {
        const res = await call(client, 'get_session', args);
        const text = errorText(res);
        expect(text).toContain('No hay ningún atleta tuyo con ese identificador');
        expect(text).not.toContain('Calidad de carrera');
        expect(res.structuredContent).toBeUndefined();
      }
    } finally {
      await close();
    }
  });
});
