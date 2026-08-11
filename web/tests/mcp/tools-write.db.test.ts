// Las tres escrituras del día, dictadas por un cliente MCP de verdad contra la DB.
//
// Lo que se prueba aquí no es «no revienta»: es que lo que el coach confirma es lo
// que queda. Por eso cada test cierra el círculo — se escribe con la tool y se
// vuelve a leer con `get_session` / `get_plan`, que es lo que el asistente hará a
// continuación y lo que el atleta verá en el móvil.
//
// Y las tres cosas que no se pueden dar por buenas nunca:
//   · el ESTADO DE VISIBILIDAD que se devuelve tiene que coincidir con la fila real
//     de `weekly_plans` — si dijéramos «publicado» de una semana en borrador, el
//     coach creería que su atleta ya lo tiene;
//   · una dosis que el atleta no podría ejecutar NO entra, y al rechazarla la DB
//     queda exactamente como estaba (ni una sesión vacía de recuerdo);
//   · el club B no puede tocar al atleta del club A, ni enterarse de que existe.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeCoachAndAthlete,
  makeExercise,
  makeMicrocycle,
  type Fixture,
} from '../utils/db-fixtures';
import { call, connectAs, errorText, payload, seedCoachLogin } from '../utils/mcp-client';

type Json = Record<string, unknown>;

/** La semana sembrada: lunes 3-ago-2026. El martes es el día que se toca. */
const MONDAY = '2026-08-03';
const TUESDAY = '2026-08-04';
const WEDNESDAY = '2026-08-05';
const THURSDAY = '2026-08-06';
/** Semana siguiente, la que se deja marcada como BORRADOR a propósito. */
const NEXT_MONDAY = '2026-08-10';
const NEXT_TUESDAY = '2026-08-11';

/** Un rodaje: 90 minutos en Z2. Dosis de bloque (no hay series que enumerar). */
const RUN_90_Z2 = {
  scheme: 'steady',
  modality: 'run',
  total_s: 5400,
  target: { kind: 'hr_zone', value: 2 },
} as const;

/** 5×5 al 75% con 2'30'' — la forma canónica de una serie de fuerza. */
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

describeWithDb('MCP · escrituras del día (DB real)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];
  const userIds: number[] = [];

  let clubA: Fixture;
  let clubB: Fixture;
  let coachAClerkId = '';
  let coachBClerkId = '';
  let runExerciseId = 0;
  let squatExerciseId = 0;
  /** Un ejercicio PROPIO del club A (no del catálogo base): el que B no puede usar. */
  let propioExerciseId = 0;

  beforeAll(async () => {
    await sql`select 1 as ok`;
    clubA = await makeCoachAndAthlete(sql);
    clubB = await makeCoachAndAthlete(sql);
    cleanups.push(clubA.cleanup, clubB.cleanup);

    coachAClerkId = await seedCoachLogin({ sql, coachId: clubA.coachId, tag: 'write-a', userIds });
    coachBClerkId = await seedCoachLogin({ sql, coachId: clubB.coachId, tag: 'write-b', userIds });

    // Sin microciclo que cubra la fecha no se puede crear una sesión (es la regla
    // del panel, no del conector): dos semanas cubiertas.
    await makeMicrocycle({
      sql,
      athleteId: clubA.athleteId,
      startIso: MONDAY,
      endIso: '2026-08-16',
    });

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
      fx: clubA,
      name: 'Sled push del club A',
      category: 'strength',
      modality: 'functional',
      coachId: clubA.coachId,
    });

    // La semana que viene queda en BORRADOR MANUAL: es el caso que el read-back
    // tiene que saber contar («el atleta NO lo ve hasta que publiques»).
    await sql`
      insert into weekly_plans (athlete_id, week_start, status, delivery_mode)
      values (${clubA.athleteId}, ${NEXT_MONDAY}::date, 'draft', 'manual')
    `;
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

  test('las tres tools de escritura se anuncian con su esquema de prescripción', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const { tools } = await client.listTools();
      const byName = new Map(tools.map((t) => [t.name, t]));
      for (const name of ['create_session', 'edit_day', 'move_session']) {
        expect(byName.has(name), `falta ${name}`).toBe(true);
      }
      // La gramática de la dosis viaja en la descripción (para que el cliente la
      // rellene bien) Y el esquema JSON de la prescripción se genera de verdad
      // (es lo que se rompería en silencio si el Zod del dominio no fuera
      // convertible a JSON Schema).
      const create = byName.get('create_session')!;
      expect(create.description).toContain('prescription.scheme');
      const schema = JSON.stringify(create.inputSchema);
      expect(schema).toContain('prescription');
      expect(schema).toContain('hr_zone');
    } finally {
      await close();
    }
  });

  test('create_session: un rodaje tipado queda escrito, legible y visible ya', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const body = payload(
        await call(client, 'create_session', {
          athlete_id: clubA.athleteId,
          date: TUESDAY,
          title: 'Rodaje largo',
          blocks: [
            {
              title: 'Rodaje',
              items: [{ exercise_id: runExerciseId, prescription: RUN_90_Z2 }],
            },
          ],
        }),
      );

      expect(body.iso_date).toBe(TUESDAY);
      expect(body.title).toBe('Rodaje largo');
      const blocks = body.blocks as Array<{ title: string; format: string; lines: string[] }>;
      expect(blocks).toHaveLength(1);
      // La dosis vuelve ESCRITA con el formateador del dominio, no en crudo.
      expect(blocks[0]!.lines[0]).toBe("Carrera continua 90' @ Z2");
      expect(blocks[0]!.format).toBe('steady');
      expect(body.avisos).toEqual([]);

      // Esa semana no tiene fila en weekly_plans → el atleta lo ve YA, y se dice.
      const visibility = body.visibility as Json;
      expect(visibility.week_start).toBe(MONDAY);
      expect(visibility.state).toBe('sin_marcar');
      expect(visibility.athlete_sees_it).toBe(true);
      expect(body._resumen as string).toContain('lo ve ya en su app');

      // Y se cierra el círculo: lo que se escribió es lo que lee get_session.
      const sessionId = Number(body.session_id);
      const read = payload(
        await call(client, 'get_session', { athlete_id: clubA.athleteId, session_id: sessionId }),
      );
      const session = read.session as Json;
      expect(session.iso_date).toBe(TUESDAY);
      expect(session.title).toBe('Rodaje largo');
      expect(session.content_state).toBe('blocks');
      const prescribed = session.prescribed as { blocks: Array<{ items: Json[] }> };
      expect(prescribed.blocks[0]!.items[0]!.exercise).toBe('Carrera continua');
      expect(prescribed.blocks[0]!.items[0]!.dose).toBe("90' @ Z2");

      // Y get_plan la ve el martes, con su id.
      const plan = payload(
        await call(client, 'get_plan', { athlete_id: clubA.athleteId, view: 'week', anchor: TUESDAY }),
      );
      const week = (plan.plan as Json).week as { days: Array<{ iso_date: string; sessions: Json[] }> };
      const tue = week.days.find((d) => d.iso_date === TUESDAY)!;
      expect(tue.sessions.map((s) => s.assignment_id)).toContain(String(sessionId));

      // La sesión NO copió ninguna plantilla: nace autorada, con su propio formato.
      const rows = await sql<Array<{ format: string; instance_of: string | null; blocks: number }>>`
        select t.format::text as format,
               t.instance_of_template_id::text as instance_of,
               (select count(*)::int from template_blocks tb where tb.template_id = t.id) as blocks
        from workout_assignments wa
        join templates t on t.id = wa.template_id
        where wa.id = ${sessionId}
      `;
      expect(rows[0]!.format).toBe('steady');
      expect(rows[0]!.instance_of).toBeNull();
      expect(rows[0]!.blocks).toBe(0);

      // Auditoría: una fila, por el canal del conector, firmada por la persona.
      const audit = await sql<Array<{ action: string; channel: string; actor_kind: string }>>`
        select action::text as action, channel, actor_kind::text as actor_kind
        from audit_log
        where entity_type = 'workout_assignments' and entity_id = ${sessionId}
      `;
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ action: 'create', channel: 'mcp', actor_kind: 'coach' });
    } finally {
      await close();
    }
  });

  test('create_session en una semana en borrador: lo dice, no lo esconde ni lo publica', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const body = payload(
        await call(client, 'create_session', {
          athlete_id: clubA.athleteId,
          date: NEXT_TUESDAY,
          title: 'Series de la semana que viene',
          blocks: [
            {
              title: 'Series',
              items: [{ exercise_id: runExerciseId, prescription: RUN_90_Z2 }],
            },
          ],
        }),
      );

      const visibility = body.visibility as Json;
      expect(visibility.week_start).toBe(NEXT_MONDAY);
      expect(visibility.state).toBe('draft');
      expect(visibility.delivery_mode).toBe('manual');
      expect(visibility.athlete_sees_it).toBe(false);
      expect(body._resumen as string).toContain('NO lo ve');

      // Y la fila de weekly_plans sigue siendo la que estaba: el conector no
      // publica ni marca borradores por su cuenta.
      const rows = await sql<Array<{ status: string; delivery_mode: string }>>`
        select status::text as status, delivery_mode from weekly_plans
        where athlete_id = ${clubA.athleteId} and week_start = ${NEXT_MONDAY}::date
      `;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: 'draft', delivery_mode: 'manual' });
    } finally {
      await close();
    }
  });

  test('create_session con una dosis que nadie puede ejecutar: rechazo legible y DB intacta', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const before = await countAssignments(sql, clubA.athleteId, WEDNESDAY);
      const text = errorText(
        await call(client, 'create_session', {
          athlete_id: clubA.athleteId,
          date: WEDNESDAY,
          title: 'Fuerza sin dosis',
          // `sets` sin nada: parsea limpio y no es un entreno.
          blocks: [
            {
              title: 'Principal',
              items: [
                { exercise_id: squatExerciseId, prescription: { scheme: 'sets', modality: 'strength' } },
              ],
            },
          ],
        }),
      );

      expect(text).toContain('Sentadilla trasera');
      expect(text).toContain('Sin dosis');
      expect(text).toContain('No he escrito nada');
      // Ni la asignación ni una instancia huérfana.
      expect(await countAssignments(sql, clubA.athleteId, WEDNESDAY)).toBe(before);
      const orphans = await sql<Array<{ n: number }>>`
        select count(*)::int as n from templates
        where instance_athlete_id = ${clubA.athleteId}
          and not exists (select 1 from workout_assignments wa where wa.template_id = templates.id)
      `;
      expect(orphans[0]!.n).toBe(0);
    } finally {
      await close();
    }
  });

  test('create_session con un ejercicio que no es suyo: misma frase que si no existiera', async () => {
    const { client, close } = await connectAs(coachBClerkId);
    try {
      // El club B, con SU propio atleta, pidiendo el ejercicio PROPIO del club A.
      await makeMicrocycle({
        sql,
        athleteId: clubB.athleteId,
        startIso: MONDAY,
        endIso: '2026-08-16',
      });
      const text = errorText(
        await call(client, 'create_session', {
          athlete_id: clubB.athleteId,
          date: TUESDAY,
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
        }),
      );
      expect(text).toContain('no existen o no son tuyos');
      expect(text).toContain('search_library');
      // Y ni una palabra del catálogo ajeno.
      expect(text).not.toContain('Sled push del club A');
    } finally {
      await close();
    }
  });

  test('edit_day: primero el borrador editable, luego el cambio de series y RIR', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      // Un jueves con DOS sesiones: la que se toca y la que tiene que quedar igual.
      const target = payload(
        await call(client, 'create_session', {
          athlete_id: clubA.athleteId,
          date: THURSDAY,
          title: 'Fuerza A',
          blocks: [
            {
              title: 'Principal',
              items: [
                {
                  exercise_id: squatExerciseId,
                  prescription: squatSets(5, { kind: 'percent_rm', value: 75 }, 5),
                },
              ],
            },
          ],
        }),
      );
      const other = payload(
        await call(client, 'create_session', {
          athlete_id: clubA.athleteId,
          date: THURSDAY,
          title: 'Rodaje suave',
          blocks: [
            { title: 'Rodaje', items: [{ exercise_id: runExerciseId, prescription: RUN_90_Z2 }] },
          ],
        }),
      );

      // Sin session_id el día es ambiguo: no toca nada y da la lista.
      const ambiguous = payload(await call(client, 'edit_day', { athlete_id: clubA.athleteId, date: THURSDAY }));
      expect(ambiguous.touched).toBe(false);
      expect((ambiguous.sessions as Json[]).map((s) => s.session_id).sort()).toEqual(
        [String(target.session_id), String(other.session_id)].sort(),
      );

      // Con session_id y sin blocks: el borrador editable, con la dosis de hoy.
      const snapshot = payload(
        await call(client, 'edit_day', {
          athlete_id: clubA.athleteId,
          date: THURSDAY,
          session_id: Number(target.session_id),
        }),
      );
      expect(snapshot.touched).toBe(false);
      const snapBlocks = snapshot.blocks as Array<{ items: Array<Json> }>;
      expect(snapBlocks[0]!.items[0]!.exercise_id).toBe(squatExerciseId);
      expect(snapBlocks[0]!.items[0]!.dose).toBe("5×5 @ 75% RM · descanso 2'30''");
      expect(snapBlocks[0]!.items[0]!.prescription).toBeTruthy();

      // Y ahora el cambio de verdad: 3×5 con 2 de RIR.
      const edited = payload(
        await call(client, 'edit_day', {
          athlete_id: clubA.athleteId,
          date: THURSDAY,
          session_id: Number(target.session_id),
          blocks: [
            {
              title: 'Principal',
              items: [
                {
                  exercise_id: squatExerciseId,
                  prescription: squatSets(5, { kind: 'rir', value: 2 }, 3),
                },
              ],
            },
          ],
        }),
      );
      const editedBlocks = edited.blocks as Array<{ lines: string[] }>;
      expect(editedBlocks[0]!.lines[0]).toBe("Sentadilla trasera 3×5 @ RIR 2 · descanso 2'30''");
      expect((edited.untouched_sessions as Json[]).map((s) => s.session_id)).toEqual([
        String(other.session_id),
      ]);

      // Persiste: lo lee get_session, que es por donde lo verá el asistente.
      const read = payload(
        await call(client, 'get_session', {
          athlete_id: clubA.athleteId,
          session_id: Number(target.session_id),
        }),
      );
      const prescribed = (read.session as Json).prescribed as { blocks: Array<{ items: Json[] }> };
      expect(prescribed.blocks[0]!.items[0]!.dose).toBe("3×5 @ RIR 2 · descanso 2'30''");

      // Y la otra sesión del día sigue exactamente como estaba.
      const untouched = payload(
        await call(client, 'get_session', {
          athlete_id: clubA.athleteId,
          session_id: Number(other.session_id),
        }),
      );
      const otherPrescribed = (untouched.session as Json).prescribed as {
        blocks: Array<{ items: Json[] }>;
      };
      expect((untouched.session as Json).title).toBe('Rodaje suave');
      expect(otherPrescribed.blocks[0]!.items[0]!.dose).toBe("90' @ Z2");

      // Auditoría del cambio: sobre la instancia, por canal mcp. Reescribir el
      // contenido de un día deja AHORA su propia entrada (borra e inserta los
      // segmentos: es la escritura más destructiva que hay), así que hay una por
      // escritura — la de crear la sesión y la de editarla. Se afirma lo que
      // importa, que todas digan quién y por dónde, no cuántas son.
      const audit = await sql<Array<{ action: string; channel: string }>>`
        select action::text as action, channel from audit_log
        where entity_type = 'templates'
          and entity_id = (select template_id from workout_assignments where id = ${Number(target.session_id)})
      `;
      expect(audit.length).toBeGreaterThanOrEqual(1);
      for (const row of audit) expect(row).toMatchObject({ action: 'update', channel: 'mcp' });
    } finally {
      await close();
    }
  });

  test('edit_day acepta lo que es criterio del entrenador, y lo devuelve como aviso', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const created = payload(
        await call(client, 'create_session', {
          athlete_id: clubA.athleteId,
          date: WEDNESDAY,
          title: 'Fuerza sin carga declarada',
          blocks: [
            {
              title: 'Principal',
              // Series y repeticiones sí; la carga la decide él en el gym.
              items: [
                {
                  exercise_id: squatExerciseId,
                  prescription: {
                    scheme: 'sets',
                    modality: 'strength',
                    sets: [
                      { measure: { kind: 'reps', value: 8 } },
                      { measure: { kind: 'reps', value: 8 } },
                    ],
                  },
                },
              ],
            },
          ],
        }),
      );
      const avisos = created.avisos as string[];
      expect(avisos.length).toBeGreaterThan(0);
      expect(avisos.join(' ')).toContain('Sin objetivo');
      // Aviso, no error: la sesión está creada.
      expect(created.session_id).toBeTruthy();
    } finally {
      await close();
    }
  });

  test('move_session: por id y por fecha, y el día ambiguo no se toca', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      // El martes tiene una sola sesión (el rodaje del primer test) → por fecha.
      const byDate = payload(
        await call(client, 'move_session', {
          athlete_id: clubA.athleteId,
          from_date: TUESDAY,
          to_date: '2026-08-07',
        }),
      );
      expect(byDate.from_iso_date).toBe(TUESDAY);
      expect(byDate.to_iso_date).toBe('2026-08-07');
      expect(byDate.title).toBe('Rodaje largo');
      expect((byDate.visibility as Json).athlete_sees_it).toBe(true);
      expect(byDate._resumen as string).toContain('pasa del 4 de agosto al 7 de agosto');

      // Y de vuelta, esta vez por id.
      const movedId = Number(byDate.session_id);
      const byId = payload(
        await call(client, 'move_session', {
          athlete_id: clubA.athleteId,
          session_id: movedId,
          to_date: TUESDAY,
        }),
      );
      expect(byId.from_iso_date).toBe('2026-08-07');
      expect(byId.to_iso_date).toBe(TUESDAY);

      const dbRows = await sql<Array<{ iso: string }>>`
        select to_char(scheduled_for, 'YYYY-MM-DD') as iso
        from workout_assignments where id = ${movedId}
      `;
      expect(dbRows[0]!.iso).toBe(TUESDAY);

      // El jueves tiene dos: sin session_id no se elige a ciegas.
      const ambiguous = payload(
        await call(client, 'move_session', {
          athlete_id: clubA.athleteId,
          from_date: THURSDAY,
          to_date: '2026-08-08',
        }),
      );
      expect(ambiguous.touched).toBe(false);
      expect((ambiguous.sessions as Json[]).length).toBe(2);
      // Y nada se ha movido.
      expect(await countAssignments(sql, clubA.athleteId, THURSDAY)).toBe(2);
      expect(await countAssignments(sql, clubA.athleteId, '2026-08-08')).toBe(0);

      // Auditoría: dos movimientos, los dos por el canal del conector.
      const audit = await sql<Array<{ n: number }>>`
        select count(*)::int as n from audit_log
        where entity_type = 'workout_assignments' and entity_id = ${movedId}
          and action = 'update' and channel = 'mcp'
      `;
      expect(audit[0]!.n).toBe(2);
    } finally {
      await close();
    }
  });

  test('move_session sin decir qué sesión: dice qué le falta', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const text = errorText(
        await call(client, 'move_session', { athlete_id: clubA.athleteId, to_date: TUESDAY }),
      );
      expect(text).toContain('session_id');
      expect(text).toContain('from_date');
    } finally {
      await close();
    }
  });

  test('cruzado: el club B no crea, no edita y no mueve nada del atleta de A', async () => {
    const { client, close } = await connectAs(coachBClerkId);
    try {
      const beforeThursday = await countAssignments(sql, clubA.athleteId, THURSDAY);
      const beforeFriday = await countAssignments(sql, clubA.athleteId, '2026-08-07');

      const attempts: Array<[string, Json]> = [
        [
          'create_session',
          {
            athlete_id: clubA.athleteId,
            date: WEDNESDAY,
            title: 'No debería existir',
            blocks: [
              { title: 'Rodaje', items: [{ exercise_id: runExerciseId, prescription: RUN_90_Z2 }] },
            ],
          },
        ],
        ['edit_day', { athlete_id: clubA.athleteId, date: THURSDAY }],
        [
          'move_session',
          { athlete_id: clubA.athleteId, from_date: THURSDAY, to_date: '2026-08-07' },
        ],
      ];

      for (const [name, args] of attempts) {
        const res = await call(client, name, args);
        const text = errorText(res);
        expect(text, name).toContain('No hay ningún atleta tuyo con ese identificador');
        // Ni el nombre del atleta, ni el de sus entrenos, ni datos estructurados.
        expect(text, name).not.toContain('Test Athlete');
        expect(text, name).not.toContain('Fuerza A');
        expect(res.structuredContent, name).toBeUndefined();
      }

      // Y el plan del atleta de A está donde estaba.
      expect(await countAssignments(sql, clubA.athleteId, THURSDAY)).toBe(beforeThursday);
      expect(await countAssignments(sql, clubA.athleteId, '2026-08-07')).toBe(beforeFriday);
      expect(await countAssignments(sql, clubA.athleteId, WEDNESDAY)).toBe(1);
    } finally {
      await close();
    }
  });
});

/** Cuántas sesiones tiene ese atleta ese día — la sonda de «la DB queda intacta». */
async function countAssignments(
  sql: import('@/lib/db').Sql,
  athleteId: number,
  iso: string,
): Promise<number> {
  const rows = await sql<Array<{ n: number }>>`
    select count(*)::int as n from workout_assignments
    where athlete_id = ${athleteId} and scheduled_for = ${iso}::date
  `;
  return rows[0]!.n;
}
