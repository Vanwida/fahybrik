// EL PORTÓN COMERCIAL del conector: el club que no lo tiene contratado no saca
// ni un dato por ninguna de las tools (migración 0167, `withCoach`).
//
// LO QUE MÁS IMPORTA de esta suite: que el portón cubre TODAS las tools y no las
// que a alguien se le ocurrió listar. Se recorren tal y como el servidor
// las anuncia (`listTools`), y los argumentos de cada una se construyen desde su
// `required`: una tool nueva sin portón, o con un argumento obligatorio que aquí
// no se sabe rellenar, hace fallar la suite en vez de colarse sin probar.
//
// Y que el rechazo es de verdad un rechazo: `isError`, la frase del coach, y CERO
// rastro del club en la respuesta (ni nombres, ni ids, ni el JSON de una tool que
// haya llegado a ejecutarse a medias).

import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';
import { call, connectAs, errorText, payload, seedCoachLogin } from '../utils/mcp-client';
import { NO_CONNECTOR_MESSAGE } from '@/lib/mcp/runtime';
import { hasEntitlement } from '@/lib/coach/entitlements';

/** Una dosis válida, para que el Zod de `create_session` deje pasar la llamada. */
const RUN_90_Z2 = {
  scheme: 'steady',
  modality: 'run',
  total_s: 5400,
  target: { kind: 'hr_zone', value: 2 },
} as const;

/**
 * Un valor válido por NOMBRE de argumento, no por tool: los nombres son
 * compartidos (`athlete_id`, `date`, `blocks`…) y así una tool nueva que reutilice
 * los de siempre queda cubierta sin tocar nada. Lo que no está aquí revienta la
 * suite a propósito — ver la cabecera.
 */
function argValue(name: string, athleteId: number): unknown {
  switch (name) {
    case 'athlete_id':
      return athleteId;
    case 'athlete_ids':
      return [athleteId];
    case 'date':
    case 'to_date':
      return '2026-08-11';
    case 'view':
      return 'week';
    case 'query':
      return 'sentadilla';
    case 'title':
    case 'name':
      return 'Rodaje largo';
    case 'body':
      return 'Un texto cualquiera.';
    case 'blocks':
      return [{ title: 'Rodaje', items: [{ exercise_id: 1, prescription: RUN_90_Z2 }] }];
    case 'weeks':
      return [
        {
          days: [
            {
              weekday: 1,
              blocks: [{ title: 'Rodaje', items: [{ exercise_id: 1, prescription: RUN_90_Z2 }] }],
            },
          ],
        },
      ];
    case 'level_id':
    case 'microcycle_id':
      return 1;
    case 'communication':
      return {
        kind: 'focus',
        title: 'El foco de la semana',
        anchor_kind: 'week',
        body: 'Cadencia alta en los rodajes.',
      };
    default:
      return undefined;
  }
}

describeWithDb('MCP · el portón del add-on (DB real)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];
  const userIds: number[] = [];

  // Tres clubes, uno por estado posible del add-on. Cada uno con su propio login,
  // porque el portón se resuelve por CLUB y no por persona.
  let conEl: Fixture;
  let sinEl: Fixture;
  let cortado: Fixture;
  let conElClerkId = '';
  let sinElClerkId = '';
  let cortadoClerkId = '';

  beforeAll(async () => {
    await sql`select 1 as ok`;
    conEl = await makeCoachAndAthlete(sql);
    sinEl = await makeCoachAndAthlete(sql);
    cortado = await makeCoachAndAthlete(sql);
    cleanups.push(conEl.cleanup, sinEl.cleanup, cortado.cleanup);

    conElClerkId = await seedCoachLogin({ sql, coachId: conEl.coachId, tag: 'ent-si', userIds });
    sinElClerkId = await seedCoachLogin({
      sql,
      coachId: sinEl.coachId,
      tag: 'ent-no',
      userIds,
      connector: 'none',
    });
    cortadoClerkId = await seedCoachLogin({
      sql,
      coachId: cortado.coachId,
      tag: 'ent-off',
      userIds,
      connector: 'inactive',
    });
  });

  afterAll(async () => {
    if (userIds.length > 0) {
      await sql`delete from subscriptions where user_id = any(${userIds}::bigint[])`;
      await sql`delete from coach_members where user_id = any(${userIds}::bigint[])`;
      await sql`delete from user_roles where user_id = any(${userIds}::bigint[])`;
      await sql`delete from users where id = any(${userIds}::bigint[])`;
    }
    // `coach_entitlements` no se limpia a mano: la fila cae con su club (0167).
    while (cleanups.length) await cleanups.pop()!();
    await closeTestSql();
  });

  test('el club con el conector contratado entra y ve sus datos', async () => {
    const { client, close } = await connectAs(conElClerkId);
    try {
      const body = payload(await call(client, 'list_athletes'));
      const athletes = body.athletes as Array<{ athlete_id: string }>;
      expect(athletes.map((a) => Number(a.athlete_id))).toContain(conEl.athleteId);
    } finally {
      await close();
    }
  });

  test('sin fila de entitlement, las tools se niegan con la frase y sin un dato', async () => {
    const { client, close } = await connectAs(sinElClerkId);
    try {
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(19);

      for (const tool of tools) {
        const required = tool.inputSchema.required ?? [];
        const args: Record<string, unknown> = {};
        for (const name of required) {
          const value = argValue(name, sinEl.athleteId);
          expect(
            value,
            `${tool.name}: argumento obligatorio «${name}» sin valor de prueba — añádelo a argValue`,
          ).toBeDefined();
          args[name] = value;
        }

        const res = await call(client, tool.name, args);
        expect(errorText(res), tool.name).toBe(NO_CONNECTOR_MESSAGE);
        // Ni el nombre del club, ni el del atleta, ni un JSON con datos: el
        // rechazo es UNA frase y nada más.
        expect(res.structuredContent, tool.name).toBeUndefined();
        expect(res.content, tool.name).toHaveLength(1);
      }
    } finally {
      await close();
    }
  });

  test('las escrituras negadas no dejan rastro: el atleta sigue sin sesiones ni notas', async () => {
    // El portón corta ANTES del cuerpo, así que ninguna de las escrituras
    // puede haber tocado nada. Se comprueba en la tabla, no en la respuesta.
    const sesiones = await sql<Array<{ n: string }>>`
      select count(*)::text as n from workout_assignments where athlete_id = ${sinEl.athleteId}
    `;
    expect(sesiones[0]!.n).toBe('0');
    const notas = await sql<Array<{ n: string }>>`
      select count(*)::text as n from athlete_coach_notes where athlete_id = ${sinEl.athleteId}
    `;
    expect(notas[0]!.n).toBe('0');
  });

  test('un entitlement en inactive tampoco abre: solo concede active', async () => {
    const { client, close } = await connectAs(cortadoClerkId);
    try {
      expect(errorText(await call(client, 'get_briefing'))).toBe(NO_CONNECTOR_MESSAGE);
      expect(errorText(await call(client, 'list_athletes'))).toBe(NO_CONNECTOR_MESSAGE);
    } finally {
      await close();
    }
  });

  test('el resolutor lee por club: cada uno el suyo, y otra capacidad no cuela', async () => {
    expect(await hasEntitlement({ coach_id: conEl.coachId, feature: 'mcp_connector' })).toBe(true);
    expect(await hasEntitlement({ coach_id: sinEl.coachId, feature: 'mcp_connector' })).toBe(false);
    expect(await hasEntitlement({ coach_id: cortado.coachId, feature: 'mcp_connector' })).toBe(
      false,
    );
    // Una capacidad que el club NO tiene contratada es `false`, no un `true` de
    // rebote por tener otra: el filtro va por (club, feature), no por club.
    expect(
      await hasEntitlement({
        coach_id: conEl.coachId,
        feature: 'add_on_inexistente' as 'mcp_connector',
      }),
    ).toBe(false);
  });
});
