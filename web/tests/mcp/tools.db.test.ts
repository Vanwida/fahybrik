// Las tres tools de lectura del conector, habladas por un cliente MCP de verdad.
//
// POR QUÉ ASÍ Y NO LLAMANDO A LAS FUNCIONES
// -----------------------------------------
// El servidor se monta con `registerCoachReadTools` y se conecta a un `Client`
// real por `InMemoryTransport`, así que lo que se ejerce es el CONTRATO MCP
// completo: el listado de tools, la validación Zod de los argumentos y la forma
// del resultado. Llamar a los handlers a pelo se saltaría justo lo que puede
// romperse sin avisar (que el SDK, mcp-handler y el zod 3 del monorepo se
// entiendan al generar el JSON Schema de cada tool).
//
// CERO MOCKS. La identidad no se simula: se siembra un `users.clerk_user_id` real
// con su membresía y el `authInfo` que el transporte inyecta es exactamente la
// forma que produce `verifyClerkToken` (`extra.userId`). El coach se resuelve
// contra la rama, como en producción. Solo la red de Clerk queda fuera, porque el
// token ya viene verificado en ese punto.
//
// LO QUE MÁS IMPORTA de esta suite: el caso cruzado. Un club pidiendo la ficha de
// un atleta del otro tiene que llevarse un error legible y NI UN DATO.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { JSONRPCMessage, RequestId } from '@modelcontextprotocol/sdk/types.js';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';
import { registerCoachReadTools } from '@/lib/mcp/tools';
import { NOT_A_COACH_MESSAGE } from '@/lib/mcp/auth';

type ToolResult = {
  content: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

function uniqClerkId(tag: string): string {
  return `clerk-mcp-tools-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/**
 * A connected client whose every message carries the auth of `clerkUserId` —
 * the same place `withMcpAuth` + mcp-handler put it (`extra.authInfo` on the
 * transport message), so the tools read it through the production path.
 */
async function connectAs(clerkUserId: string): Promise<{ client: Client; close: () => Promise<void> }> {
  const server = new McpServer({ name: 'fahybrid-coach-test', version: '1.0.0' });
  registerCoachReadTools(server);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const authInfo: AuthInfo = {
    token: 'test-oauth-token',
    clientId: 'test-mcp-client',
    scopes: [],
    extra: { userId: clerkUserId },
  };
  const rawSend = clientTransport.send.bind(clientTransport);
  clientTransport.send = (
    message: JSONRPCMessage,
    options?: { relatedRequestId?: RequestId; authInfo?: AuthInfo },
  ) => rawSend(message, { ...options, authInfo });

  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

async function call(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolResult> {
  return (await client.callTool({ name, arguments: args })) as ToolResult;
}

/** The JSON body of a successful tool answer. */
function payload(res: ToolResult): Record<string, unknown> {
  expect(res.isError).not.toBe(true);
  const text = res.content[0]?.text;
  expect(typeof text).toBe('string');
  return JSON.parse(text!) as Record<string, unknown>;
}

describeWithDb('MCP · las 3 tools de lectura (DB real)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];
  const userIds: number[] = [];

  let clubA: Fixture;
  let clubB: Fixture;
  let coachAClerkId = '';
  let coachBClerkId = '';
  let strangerClerkId = '';

  async function seedCoachLogin(fx: Fixture, tag: string): Promise<string> {
    const clerkUserId = uniqClerkId(tag);
    const rows = await sql<Array<{ id: string }>>`
      insert into users (email, role, clerk_user_id, full_name)
      values (
        ${`mcp-tools-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`},
        'coach',
        ${clerkUserId},
        ${`Coach ${tag}`}
      )
      returning id::text as id
    `;
    const userId = Number(rows[0]!.id);
    userIds.push(userId);
    await sql`
      insert into coach_members (coach_id, user_id, membership_role)
      values (${fx.coachId}, ${userId}, 'coach')
    `;
    return clerkUserId;
  }

  beforeAll(async () => {
    await sql`select 1 as ok`;
    clubA = await makeCoachAndAthlete(sql);
    clubB = await makeCoachAndAthlete(sql);
    cleanups.push(clubA.cleanup, clubB.cleanup);

    coachAClerkId = await seedCoachLogin(clubA, 'a');
    coachBClerkId = await seedCoachLogin(clubB, 'b');

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

  test('el servidor anuncia exactamente las 3 tools, y solo de lectura', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual([
        'get_athlete',
        'get_briefing',
        'list_athletes',
      ]);
      // Ninguna escribe todavía (fase 1). El hint es lo que le dice al cliente
      // que no hace falta pedir confirmación al coach para leer.
      for (const t of tools) {
        expect(t.annotations?.readOnlyHint).toBe(true);
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

  test('token válido de quien no es coach: las 3 tools se niegan con la misma frase', async () => {
    const { client, close } = await connectAs(strangerClerkId);
    try {
      for (const [name, args] of [
        ['get_briefing', {}],
        ['list_athletes', {}],
        ['get_athlete', { athlete_id: 1 }],
      ] as const) {
        const res = await call(client, name, args);
        expect(res.isError, `${name} debería negarse`).toBe(true);
        expect(res.content[0]?.text).toBe(NOT_A_COACH_MESSAGE);
      }
    } finally {
      await close();
    }
  });

  test('sin authInfo en la petición no se llega a ningún dato', async () => {
    // El 401 lo pone withMcpAuth antes de esto; la tool es la segunda cerradura,
    // para que un fallo de cableado del transporte no se convierta en acceso.
    const server = new McpServer({ name: 'fahybrid-coach-test', version: '1.0.0' });
    registerCoachReadTools(server);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const res = await call(client, 'get_briefing');
      expect(res.isError).toBe(true);
      expect(res.content[0]?.text).toBe(NOT_A_COACH_MESSAGE);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
