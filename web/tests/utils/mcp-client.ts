// Un cliente MCP de verdad contra el servidor de tools, por memoria.
//
// POR QUÉ ASÍ Y NO LLAMANDO A LOS HANDLERS. Montando el servidor con
// `registerCoachTools` y conectando un `Client` real por `InMemoryTransport` se
// ejerce el CONTRATO MCP completo: el listado de tools, la validación Zod de los
// argumentos y la forma del resultado. Llamar a los handlers a pelo se saltaría
// justo lo que puede romperse sin avisar (que el SDK, mcp-handler y el zod 3 del
// monorepo se entiendan al generar el JSON Schema de cada tool).
//
// CERO MOCKS DE IDENTIDAD. El `authInfo` que se inyecta es exactamente la forma que
// produce `verifyClerkToken` (`extra.userId`), en el mismo sitio donde lo pone
// `withMcpAuth` + mcp-handler (`extra.authInfo` del mensaje del transporte), así que
// las tools lo leen por el camino de producción y el coach se resuelve contra la
// rama. Solo queda fuera la red de Clerk, porque a esa altura el token ya viene
// verificado.

import { expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { JSONRPCMessage, RequestId } from '@modelcontextprotocol/sdk/types.js';
import { registerCoachTools } from '@/lib/mcp/tools';

export type ToolResult = {
  content: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export type McpTestClient = { client: Client; close: () => Promise<void> };

/** Un clerk_user_id único por test, para que dos suites no se pisen la membresía. */
export function uniqClerkId(tag: string): string {
  return `clerk-mcp-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/**
 * Un cliente conectado cuyos mensajes llevan todos la identidad de `clerkUserId`.
 * Pasa `null` para conectar SIN identidad: la tool es la segunda cerradura (el 401
 * lo pone `withMcpAuth` antes), y eso también se prueba.
 */
export async function connectAs(clerkUserId: string | null): Promise<McpTestClient> {
  const server = new McpServer({ name: 'fahybrid-coach-test', version: '1.0.0' });
  registerCoachTools(server);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  if (clerkUserId !== null) {
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
  }

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

export async function call(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolResult> {
  return (await client.callTool({ name, arguments: args })) as ToolResult;
}

/** El cuerpo JSON de una respuesta con éxito. */
export function payload(res: ToolResult): Record<string, unknown> {
  expect(res.isError).not.toBe(true);
  const text = res.content[0]?.text;
  expect(typeof text).toBe('string');
  return JSON.parse(text!) as Record<string, unknown>;
}

/** El texto de un rechazo, ya unido. */
export function errorText(res: ToolResult): string {
  expect(res.isError).toBe(true);
  return res.content.map((c) => c.text ?? '').join(' ');
}

/**
 * Siembra un login de coach real: un `users.clerk_user_id` con su membresía en el
 * club, que es lo que resuelve `getCoachSessionForClerkUser` en producción, MÁS el
 * entitlement del conector, que es lo que resuelve el portón de `withCoach`.
 * Devuelve el clerk id y apunta el user id en `userIds` para el teardown.
 *
 * El entitlement viene puesto por defecto porque el club que habla por el conector
 * lo tiene contratado: es el estado normal, y lo que cada suite quiere ejercitar es
 * su dominio, no el portón. `connector` lo baja a propósito para las suites que SÍ
 * prueban el portón. No hace falta limpiarlo: `coach_entitlements.coach_id` va con
 * `on delete cascade` (mig 0167), así que se va con su club.
 */
export async function seedCoachLogin(params: {
  sql: import('@/lib/db').Sql;
  coachId: number;
  tag: string;
  userIds: number[];
  /** 'active' (defecto) · 'inactive' = contratado y cortado · 'none' = sin fila. */
  connector?: 'active' | 'inactive' | 'none';
}): Promise<string> {
  const { sql, coachId, tag, userIds, connector = 'active' } = params;
  const clerkUserId = uniqClerkId(tag);
  const rows = await sql<Array<{ id: string }>>`
    insert into users (email, role, clerk_user_id, full_name)
    values (
      ${`mcp-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`},
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
    values (${coachId}, ${userId}, 'coach')
  `;
  if (connector !== 'none') {
    // `do update` y no `do nothing`: si una suite siembra dos logins del MISMO
    // club, el estado del conector que vale es el último que se pidió, no el
    // primero que llegó.
    await sql`
      insert into coach_entitlements (coach_id, feature, status, source)
      values (${coachId}, 'mcp_connector', ${connector}, 'founder')
      on conflict (coach_id, feature) do update set
        status = excluded.status,
        updated_at = now()
    `;
  }
  return clerkUserId;
}
