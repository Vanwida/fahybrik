// Las cuatro tools que no van del plan: carreras, biblioteca, metodología y
// comunicados. Cliente MCP de verdad contra la DB.
//
// Lo que cada una tiene que demostrar:
//   · get_races — el objetivo con su tiempo, el formato y el historial con
//     resultado; y que un club no ve las carreras del atleta del otro.
//   · search_library — que busca en los TRES peldaños y que `kind` limita de
//     verdad, con el nombre que el coach le puso a cada cosa.
//   · search_methodology — que un coach SIN documentos indexados se lleva una
//     frase que se entiende, no un array vacío mudo (y sin gastar una llamada al
//     modelo de embeddings para averiguarlo).
//   · list_communications — lo comunicado a UN atleta con SU estado de seguimiento.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeCoachAndAthlete,
  makeExercise,
  makeLibraryBlock,
  makeTemplate,
  type Fixture,
} from '../utils/db-fixtures';
import { call, connectAs, errorText, payload, seedCoachLogin } from '../utils/mcp-client';
import { createCommunication } from '@/lib/coach/communications';
import { publishCommunication } from '@/lib/coach/communications-publish';
import { createCommunicationSchema } from '@fahybrid/shared/domain/coach-communications';

type Json = Record<string, unknown>;

describeWithDb('MCP · carreras, biblioteca, metodología y comunicados (DB real)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];
  const userIds: number[] = [];
  const coachIds: number[] = [];
  const raceIds: number[] = [];

  let clubA: Fixture;
  let clubB: Fixture;
  let coachAClerkId = '';
  let coachBClerkId = '';
  let blockId = 0;
  let templateId = 0;
  let communicationId = '';
  let taskCommunicationId = '';

  async function seedRace(fx: Fixture, race: Record<string, unknown>): Promise<number> {
    const rows = await sql<Array<{ id: string }>>`
      insert into races ${sql({ athlete_id: fx.athleteId, ...race } as never)}
      returning id::text as id
    `;
    const id = Number(rows[0]!.id);
    raceIds.push(id);
    return id;
  }

  beforeAll(async () => {
    await sql`select 1 as ok`;
    clubA = await makeCoachAndAthlete(sql);
    clubB = await makeCoachAndAthlete(sql);
    cleanups.push(clubA.cleanup, clubB.cleanup);
    coachIds.push(clubA.coachId, clubB.coachId);

    coachAClerkId = await seedCoachLogin({ sql, coachId: clubA.coachId, tag: 'club-a', userIds });
    coachBClerkId = await seedCoachLogin({ sql, coachId: clubB.coachId, tag: 'club-b', userIds });

    // ── Carreras: un objetivo lejano y una corrida con resultado ──────────────
    await seedRace(clubA, {
      name: 'HYROX Barcelona 2027',
      event_type: 'hyrox',
      format: 'singles',
      division: 'pro',
      gender_category: 'men',
      priority: 'target',
      race_date: '2027-03-13',
      location: 'Barcelona',
      goal_time_seconds: 3540,
      status: 'registered',
    });
    await seedRace(clubA, {
      name: 'HYROX Valencia 2025',
      event_type: 'hyrox',
      format: 'singles',
      division: 'open',
      gender_category: 'men',
      priority: 'target',
      race_date: '2025-11-15',
      location: 'Valencia',
      result_time_seconds: 4347,
      run_total_seconds: 2100,
      roxzone_seconds: 300,
      best_run_lap_seconds: 240,
      overall_rank: 120,
      field_size: 600,
      status: 'completed',
    });

    // ── Biblioteca: un ejercicio, un bloque tipado y una plantilla ────────────
    // Un ejercicio PROPIO del club A (0132): invisible para cualquier otro coach.
    const rowExerciseId = await makeExercise({
      fx: clubA,
      name: 'Remo Concept2',
      category: 'cardio',
      modality: 'row',
      coachId: clubA.coachId,
    });
    blockId = await makeLibraryBlock({
      fx: clubA,
      title: 'Remo continuo Z2',
      description: "20' de remo en Z2 a 22 spm, respirando por la nariz",
      exercises: [
        {
          exercise_id: rowExerciseId,
          position: 0,
          params_json: { duration_seconds: 1200, hr_zone: 2 },
        },
      ],
    });
    // Con su prescripción estructurada, que es lo que hace que el bloque cuente
    // como ejecutable: el gate juzga la dosis, no el hecho de estar tipado.
    await sql`
      update block_exercises
      set prescription_json = ${sql.json({
        scheme: 'steady',
        modality: 'row',
        total_s: 1200,
        target: { kind: 'hr_zone', value: 2 },
      })}
      where block_id = ${blockId}
    `;
    templateId = await makeTemplate({ fx: clubA, name: 'Remo largo del domingo' });

    // ── Comunicados: un protocolo publicado y ya visto por el atleta ──────────
    const created = await createCommunication({
      coach_id: clubA.coachId,
      input: createCommunicationSchema.parse({
        kind: 'protocol',
        title: 'Protocolo de día de carrera',
        anchor_kind: 'race',
        items: [
          { label: '−3 h', content: 'Desayuna lo de siempre' },
          { label: '−40\'', content: 'Movilidad de cadera y tobillo' },
        ],
        final_note: 'Si algo va mal, me escribes antes de empezar.',
      }),
      sql,
    });
    communicationId = created.id;

    // Y una TAREA con fecha: vista pero sin hacer. Es la que sigue reclamando
    // atención (un protocolo visto ya no reclama nada: no hay nada que contestar).
    const task = await createCommunication({
      coach_id: clubA.coachId,
      input: createCommunicationSchema.parse({
        kind: 'task',
        title: 'Súbete el vídeo del clean',
        anchor_kind: 'general',
        due_date: '2026-08-20',
      }),
      sql,
    });
    taskCommunicationId = task.id;

    for (const id of [created.id, task.id]) {
      await publishCommunication({
        coach_id: clubA.coachId,
        id,
        athlete_ids: [clubA.athleteId],
        sql,
      });
      // El atleta los abrió: el estado intermedio, el que hoy la app confunde
      // con el final.
      await sql`
        update coach_communication_recipients
        set seen_at = now()
        where communication_id = ${id}::bigint and athlete_id = ${clubA.athleteId}
      `;
    }
  });

  afterAll(async () => {
    if (raceIds.length > 0) await sql`delete from races where id = any(${raceIds}::bigint[])`;
    if (coachIds.length > 0) {
      await sql`delete from coach_communications where coach_id = any(${coachIds}::bigint[])`;
    }
    if (userIds.length > 0) {
      await sql`delete from notifications where user_id = any(${userIds}::bigint[])`;
      await sql`delete from coach_members where user_id = any(${userIds}::bigint[])`;
      await sql`delete from user_roles where user_id = any(${userIds}::bigint[])`;
      await sql`delete from users where id = any(${userIds}::bigint[])`;
    }
    await sql`delete from notifications where user_id = ${clubA.athleteUserId}`;
    while (cleanups.length) await cleanups.pop()!();
    await closeTestSql();
  });

  test('get_races: objetivo con su tiempo, formato y el historial con resultado', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const body = payload(await call(client, 'get_races', { athlete_id: clubA.athleteId }));
      const races = body.races as Json;

      const target = races.target_race as Json;
      expect(target.name).toBe('HYROX Barcelona 2027');
      // El objetivo viaja en segundos Y escrito, para que se pueda citar.
      expect(target.goal_time_seconds).toBe(3540);
      expect(target.goal_time).toBe('0:59:00');
      expect(target.category).toBe('Individual · Pro · Hombres');
      expect(target.days_until as number).toBeGreaterThan(0);

      expect((races.upcoming as Json[]).map((r) => r.name)).toEqual(['HYROX Barcelona 2027']);

      const past = races.past as Json[];
      expect(past).toHaveLength(1);
      expect(past[0]!.name).toBe('HYROX Valencia 2025');
      expect(past[0]!.result_time).toBe('1:12:27');
      expect(past[0]!.percentile).toBeCloseTo(0.2, 5);
      expect(past[0]!.splits).toMatchObject({
        run_total: '35:00',
        roxzone: '5:00',
        best_run_lap: '4:00',
      });
      // Los 16 parciales no viajan: viaja cuántos hay guardados.
      expect((past[0]!.splits as Json).station_count).toBe(0);

      // Sin predicción congelada antes de esa carrera no se inventa ninguna.
      expect(races.predicted_vs_real).toBeNull();

      expect(body._resumen as string).toContain('HYROX Barcelona 2027');
      expect(body._resumen as string).toContain('objetivo 0:59:00');
      expect(body._resumen as string).toContain('mejor 1:12:27');
    } finally {
      await close();
    }
  });

  test('cruzado: el club B pide las carreras del atleta de A → error y cero datos', async () => {
    const { client, close } = await connectAs(coachBClerkId);
    try {
      const res = await call(client, 'get_races', { athlete_id: clubA.athleteId });
      const text = errorText(res);
      expect(text).toContain('No hay ningún atleta tuyo con ese identificador');
      expect(text).not.toContain('Barcelona');
      expect(res.structuredContent).toBeUndefined();
    } finally {
      await close();
    }
  });

  test('search_library sin kind: busca en los tres peldaños y los devuelve aparte', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const body = payload(await call(client, 'search_library', { query: 'remo' }));

      expect(body.searched).toEqual(['exercise', 'block', 'template']);

      const exercises = body.exercises as Json[];
      expect(exercises.map((e) => e.name)).toContain('Remo Concept2');
      expect(exercises.find((e) => e.name === 'Remo Concept2')).toMatchObject({
        modality: 'row',
        origin: 'own',
      });

      const blocks = body.blocks as Json[];
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        block_id: blockId,
        title: 'Remo continuo Z2',
        exercise_count: 1,
        part_count: 1,
      });
      // Un bloque tipado y con dosis está listo para poner en un día.
      expect(blocks[0]!.readiness).toBe('listo');
      expect(blocks[0]!.content).toContain('20');

      const templates = body.templates as Json[];
      expect(templates).toHaveLength(1);
      expect(templates[0]).toMatchObject({
        template_id: String(templateId),
        name: 'Remo largo del domingo',
      });

      expect(body._resumen as string).toContain('«remo»');
      expect(body._resumen as string).toContain('1 bloque');
    } finally {
      await close();
    }
  });

  test('search_library con kind: los demás peldaños ni se buscan (null, no [])', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const body = payload(
        await call(client, 'search_library', { query: 'remo', kind: 'block' }),
      );

      expect(body.searched).toEqual(['block']);
      expect((body.blocks as Json[])).toHaveLength(1);
      // null = no se ha buscado ahí; [] sería «buscado y nada», que es otra cosa.
      expect(body.exercises).toBeNull();
      expect(body.templates).toBeNull();
      expect(body._resumen as string).not.toContain('ejercicio');
    } finally {
      await close();
    }
  });

  test('search_library sin resultados: lo dice, y no se cuelga de la biblioteca ajena', async () => {
    const { client, close } = await connectAs(coachBClerkId);
    try {
      // El club B no tiene nada de esto: el ejercicio es PROPIO del club A y el
      // bloque y la plantilla también son suyos.
      const body = payload(await call(client, 'search_library', { query: 'remo' }));
      expect(body.blocks).toEqual([]);
      expect(body.templates).toEqual([]);
      const asText = JSON.stringify(body);
      expect(asText).not.toContain('Remo Concept2');
      expect(asText).not.toContain('Remo continuo Z2');
      expect(asText).not.toContain('Remo largo del domingo');
    } finally {
      await close();
    }
  });

  test('search_methodology sin documentos indexados: una frase que se entiende', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const text = errorText(
        await call(client, 'search_methodology', { query: 'cómo bajar carga en el taper' }),
      );
      // No un array vacío mudo: lo que falta es el CORPUS, y se dice dónde subirlo.
      expect(text).toContain('ningún documento de metodología indexado');
      expect(text).toContain('Metodología');
    } finally {
      await close();
    }
  });

  test('list_communications con athlete_id: lo comunicado y SU estado', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const body = payload(
        await call(client, 'list_communications', { athlete_id: clubA.athleteId }),
      );

      expect(body.athlete_name).toBe('Test Athlete');
      expect(body.count).toBe(2);
      const rows = body.communications as Json[];
      const protocol = rows.find((r) => r.communication_id === communicationId)!;
      const task = rows.find((r) => r.communication_id === taskCommunicationId)!;

      expect(protocol).toMatchObject({
        kind: 'protocol',
        title: 'Protocolo de día de carrera',
        status: 'published',
      });
      expect((protocol.items as Json[]).map((i) => i.label)).toEqual(['−3 h', "−40'"]);
      expect(protocol.tracking).toEqual({ recipients: 1, seen: 1, done: 0, answered: 0 });

      // Los dos están vistos, pero solo la TAREA sigue reclamando: un protocolo
      // leído ya no tiene nada que contestar ni que cerrar.
      expect(protocol.athlete_state).toMatchObject({
        state: 'seen',
        state_es: 'visto sin cerrar',
        claims_attention: false,
      });
      expect((protocol.athlete_state as Json).done_at).toBeNull();
      expect(task).toMatchObject({ kind: 'task', due_date: '2026-08-20' });
      expect(task.athlete_state).toMatchObject({ state: 'seen', claims_attention: true });

      expect(body._resumen as string).toContain('Test Athlete');
      expect(body._resumen as string).toContain('2 vistos sin cerrar');
      expect(body._resumen as string).toContain('1 que espera algo de él');
    } finally {
      await close();
    }
  });

  test('list_communications sin athlete_id: la lista del coach, y solo la suya', async () => {
    const { client, close } = await connectAs(coachBClerkId);
    try {
      const body = payload(await call(client, 'list_communications', {}));
      expect(body.view).toBe('published');
      expect(body.count).toBe(0);
      expect(JSON.stringify(body)).not.toContain('Protocolo de día de carrera');
      expect(body._resumen as string).toContain('No tienes comunicados publicados');
    } finally {
      await close();
    }
  });

  test('list_communications de un atleta ajeno: error legible y cero datos', async () => {
    const { client, close } = await connectAs(coachBClerkId);
    try {
      const res = await call(client, 'list_communications', { athlete_id: clubA.athleteId });
      const text = errorText(res);
      expect(text).toContain('No hay ningún atleta tuyo con ese identificador');
      expect(text).not.toContain('Protocolo');
    } finally {
      await close();
    }
  });
});
