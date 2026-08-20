// Las tools del ATLETA (su día, su lista, su ficha), habladas por un cliente MCP
// de verdad. El cliente, la identidad sembrada y los helpers viven en
// `tests/utils/mcp-client.ts`, que es de quien tiran también las suites de las
// demás tools del conector.
//
// LO QUE MÁS IMPORTA de esta suite: el caso cruzado. Un club pidiendo la ficha de
// un atleta del otro tiene que llevarse un error legible y NI UN DATO.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';
import { call, connectAs, payload, seedCoachLogin, uniqClerkId } from '../utils/mcp-client';
import { NOT_A_COACH_MESSAGE } from '@/lib/mcp/auth';

describeWithDb('MCP · las tools del atleta (DB real)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];
  const userIds: number[] = [];

  let clubA: Fixture;
  let clubB: Fixture;
  let coachAClerkId = '';
  let coachBClerkId = '';
  let strangerClerkId = '';

  beforeAll(async () => {
    await sql`select 1 as ok`;
    clubA = await makeCoachAndAthlete(sql);
    clubB = await makeCoachAndAthlete(sql);
    cleanups.push(clubA.cleanup, clubB.cleanup);

    coachAClerkId = await seedCoachLogin({ sql, coachId: clubA.coachId, tag: 'atl-a', userIds });
    coachBClerkId = await seedCoachLogin({ sql, coachId: clubB.coachId, tag: 'atl-b', userIds });

    // Un login real que no es coach de ningún club.
    strangerClerkId = uniqClerkId('stranger');
    const stranger = await sql<Array<{ id: string }>>`
      insert into users (email, role, clerk_user_id, full_name)
      values (
        ${`mcp-tools-stranger-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`},
        'athlete',
        ${strangerClerkId},
        'Nadie'
      )
      returning id::text as id
    `;
    userIds.push(Number(stranger[0]!.id));
  });

  afterAll(async () => {
    if (userIds.length > 0) {
      await sql`delete from subscriptions where user_id = any(${userIds}::bigint[])`;
      await sql`delete from coach_members where user_id = any(${userIds}::bigint[])`;
      await sql`delete from user_roles where user_id = any(${userIds}::bigint[])`;
      await sql`delete from users where id = any(${userIds}::bigint[])`;
    }
    while (cleanups.length) await cleanups.pop()!();
    await closeTestSql();
  });

  test('el servidor anuncia exactamente sus 19 tools, y quién lee y quién escribe', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual([
        'add_note',
        'create_microcycle',
        'create_session',
        'edit_day',
        'get_athlete',
        'get_briefing',
        'get_plan',
        'get_races',
        'get_session',
        'list_athletes',
        'list_communications',
        'move_session',
        'publish_communication',
        'publish_week',
        'search_library',
        'search_methodology',
        'send_message',
        'set_week_focus',
        'update_microcycle',
      ]);
      // El hint de lectura es lo que le dice al cliente que no hace falta pedir
      // confirmación al coach; las que escriben lo declaran en FALSO
      // justamente para que SÍ la pida antes de tocar o soltar nada.
      const WRITERS = new Set([
        'add_note',
        'create_microcycle',
        'create_session',
        'edit_day',
        'move_session',
        'publish_communication',
        'publish_week',
        'send_message',
        'set_week_focus',
        'update_microcycle',
      ]);
      for (const t of tools) {
        expect(t.annotations?.readOnlyHint, t.name).toBe(!WRITERS.has(t.name));
        expect(t.description).toBeTruthy();
      }

      // El esquema de entrada viaja generado desde el zod 3 del monorepo: si el
      // SDK y ese zod no se entendieran, esto saldría vacío.
      const athlete = tools.find((t) => t.name === 'get_athlete')!;
      expect(athlete.inputSchema.required).toEqual(['athlete_id']);
      const list = tools.find((t) => t.name === 'list_athletes')!;
      expect(list.inputSchema.required ?? []).toEqual([]);
      expect(Object.keys(list.inputSchema.properties ?? {})).toEqual(['modality']);
    } finally {
      await close();
    }
  });

  test('get_briefing responde el día del coach con su frase de una línea', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const res = await call(client, 'get_briefing');
      const body = payload(res);

      expect(typeof body._resumen).toBe('string');
      expect(body._resumen as string).toContain('1 atleta');

      const briefing = body.briefing as Record<string, unknown>;
      expect(briefing.active_athlete_count).toBe(1);
      expect(typeof briefing.greeting).toBe('string');
      expect(typeof briefing.iso_date).toBe('string');
      expect(Array.isArray(briefing.lines)).toBe(true);
      expect(briefing.is_first_time).toBe(false);

      // Mismo objeto, tipado, para el cliente que sepa leerlo.
      expect(res.structuredContent?._resumen).toBe(body._resumen);
    } finally {
      await close();
    }
  });

  test('list_athletes devuelve solo los atletas del club que pregunta', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const body = payload(await call(client, 'list_athletes'));

      expect(body.count).toBe(1);
      const athletes = body.athletes as Array<Record<string, unknown>>;
      expect(athletes).toHaveLength(1);
      expect(athletes[0]!.athlete_id).toBe(String(clubA.athleteId));
      expect(athletes[0]!.full_name).toBe('Test Athlete');

      // El atleta del otro club no aparece por ningún lado.
      const asText = JSON.stringify(body);
      expect(asText).not.toContain(String(clubB.athleteId));

      // La adherencia viaja CON su ventana: el número solo es ilegible, porque
      // la del roster son 7 días y la de la ficha 30, y no coinciden.
      expect(athletes[0]!.compliance).toEqual({ pct: null, window_days: 7 });
      // Sin nada programado, la adherencia es DESCONOCIDA (null), no 0%: un cero
      // acusaría al atleta de haberse saltado sesiones que nadie le puso.
      expect((athletes[0]!.compliance as Record<string, unknown>).pct).toBeNull();

      // La carga sí es 0, y eso es correcto: quien no ha entrenado nada tiene
      // cero carga MEDIDA, no carga desconocida. Lo que lo distingue de un hueco
      // es la cobertura, que viaja al lado del número y dice 'no_work'.
      const load = athletes[0]!.load as Record<string, unknown>;
      expect(load.ctl).toBe(0);
      expect(load.coverage).toMatchObject({ state: 'no_work', allows_verdict: true });

      // Las señales llegan con su motivo, no solo con una severidad: es lo que
      // permite al asistente contestar "por qué" y no solo "quién".
      const signals = athletes[0]!.signals as Array<Record<string, unknown>>;
      expect(signals.length).toBeGreaterThan(0);
      for (const s of signals) {
        expect(typeof s.label).toBe('string');
        expect(typeof s.detail).toBe('string');
        expect(['critical', 'warning']).toContain(s.severity);
      }
      // Un atleta sin mes asignado no tiene plan que seguir, y se dice.
      expect(athletes[0]!.programming).toEqual({
        status: 'no_month',
        label: 'Sin mes asignado',
      });
      expect(body.filtered_by_modality).toBeNull();
    } finally {
      await close();
    }
  });

  test('list_athletes con modality filtra por el plan del atleta', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      // Sin suscripción no tiene plan, así que ningún filtro lo alcanza.
      const sinPlan = payload(await call(client, 'list_athletes', { modality: 'dobles' }));
      expect(sinPlan.count).toBe(0);
      expect(sinPlan.filtered_by_modality).toBe('dobles');
      expect(sinPlan._resumen as string).toContain('dobles');

      await sql`
        insert into subscriptions (user_id, plan_type, status)
        values (${clubA.athleteUserId}, 'dobles', 'active')
      `;

      const enDobles = payload(await call(client, 'list_athletes', { modality: 'dobles' }));
      expect(enDobles.count).toBe(1);
      expect((enDobles.athletes as Array<Record<string, unknown>>)[0]!.athlete_id).toBe(
        String(clubA.athleteId),
      );

      // Y el filtro discrimina de verdad, no deja pasar todo.
      const enIndividual = payload(await call(client, 'list_athletes', { modality: 'individual' }));
      expect(enIndividual.count).toBe(0);
    } finally {
      await close();
    }
  });

  test('list_athletes rechaza un plan inventado y dice cuáles valen', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      // La validación es del protocolo (el zod de la tool), así que esto no llega
      // nunca al handler ni a la DB. Y el error ENUMERA los valores válidos, que
      // es lo que permite al asistente corregirse solo en vez de insistir.
      const res = await call(client, 'list_athletes', { modality: 'élite' });

      expect(res.isError).toBe(true);
      const text = res.content.map((c) => c.text ?? '').join(' ');
      expect(text).toContain('individual');
      expect(text).toContain('dobles');
      expect(text).toContain('pro_elite');
    } finally {
      await close();
    }
  });

  test('get_athlete devuelve la ficha conversacional, sin las series de píxeles', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const body = payload(await call(client, 'get_athlete', { athlete_id: clubA.athleteId }));

      const athlete = body.athlete as Record<string, unknown>;
      expect((athlete.athlete as Record<string, unknown>).full_name).toBe('Test Athlete');
      expect((athlete.athlete as Record<string, unknown>).athlete_id).toBe(String(clubA.athleteId));
      expect(body._resumen as string).toContain('Test Athlete');

      // Los bloques que el coach pregunta, presentes.
      for (const key of [
        'compliance',
        'readiness',
        'load',
        'modality_7d',
        'compliance_30d',
        'performance',
        'recent_days',
        'notes',
        'signals',
      ]) {
        expect(athlete, `falta ${key}`).toHaveProperty(key);
      }

      // Y las series crudas de las sparklines, FUERA. Esto es lo que garantiza
      // que el mapeo es explícito: si alguien lo cambia por un spread del payload
      // del panel, `trends` reaparece y este test cae.
      expect(athlete).not.toHaveProperty('trends');
      expect(athlete).not.toHaveProperty('banner');
      expect(athlete).not.toHaveProperty('carga');
      expect(athlete).not.toHaveProperty('header');

      // El resumen de 30 días sí queda, como cuentas.
      const c30 = athlete.compliance_30d as Record<string, unknown>;
      expect(c30).toHaveProperty('pct');
      expect(c30).toHaveProperty('done');
      expect(c30).toHaveProperty('total');
    } finally {
      await close();
    }
  });

  test('get_athlete de un atleta de OTRO club: error legible y cero datos', async () => {
    const { client, close } = await connectAs(coachBClerkId);
    try {
      const res = await call(client, 'get_athlete', { athlete_id: clubA.athleteId });

      expect(res.isError).toBe(true);
      const text = res.content.map((c) => c.text ?? '').join(' ');
      // Se responde igual que a un id inexistente: confirmar que existe en otro
      // sitio ya sería la fuga.
      expect(text).toContain('No hay ningún atleta tuyo con ese identificador');
      // Y no se escapa NADA del atleta ajeno.
      expect(text).not.toContain('Test Athlete');
      expect(res.structuredContent).toBeUndefined();
    } finally {
      await close();
    }
  });

  test('get_athlete de un id que no existe: el mismo error', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const res = await call(client, 'get_athlete', { athlete_id: 2_147_483_600 });
      expect(res.isError).toBe(true);
      expect(res.content[0]?.text).toContain('No hay ningún atleta tuyo');
    } finally {
      await close();
    }
  });

  test('token válido de quien no es coach: TODAS las tools se niegan igual', async () => {
    const { client, close } = await connectAs(strangerClerkId);
    try {
      // Las nueve, no solo las del atleta: un login sin club no puede colarse por
      // la puerta de atrás de la que se añadió más tarde.
      for (const [name, args] of [
        ['get_briefing', {}],
        ['list_athletes', {}],
        ['get_athlete', { athlete_id: 1 }],
        ['get_plan', { athlete_id: 1, view: 'week' }],
        ['get_session', { athlete_id: 1, date: '2026-08-03' }],
        ['get_races', { athlete_id: 1 }],
        ['search_library', { query: 'remo' }],
        ['search_methodology', { query: 'tapering' }],
        ['list_communications', {}],
      ] as const) {
        const res = await call(client, name, args);
        expect(res.isError, `${name} debería negarse`).toBe(true);
        expect(res.content[0]?.text, `${name}`).toBe(NOT_A_COACH_MESSAGE);
      }
    } finally {
      await close();
    }
  });

  test('sin authInfo en la petición no se llega a ningún dato', async () => {
    // El 401 lo pone withMcpAuth antes de esto; la tool es la segunda cerradura,
    // para que un fallo de cableado del transporte no se convierta en acceso.
    const { client, close } = await connectAs(null);
    try {
      const res = await call(client, 'get_briefing');
      expect(res.isError).toBe(true);
      expect(res.content[0]?.text).toBe(NOT_A_COACH_MESSAGE);
    } finally {
      await close();
    }
  });
});
