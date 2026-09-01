// La puerta de /api/mcp: el 401 que arranca el OAuth, el 404 de lo que no es un
// transporte, y el 429 del rate limit.
//
// POR QUÉ ES UN TEST Y NO UN CURL
// -------------------------------
// Esto es lo más frágil de la fase 1 y lo más difícil de ver: si el 401 no lleva
// el `WWW-Authenticate` con el puntero al metadata, el cliente no tiene por dónde
// empezar el OAuth y simplemente "no se conecta", sin dar un motivo. Es el fallo
// reportado en abril-2026 que el plan lista como riesgo principal. Un curl a mano
// lo comprobaría hoy; esto lo comprueba en cada suite.
//
// Se mockea SOLO `@clerk/nextjs/server`, que es la frontera de red que no
// podemos cruzar en un test (verificar un token contra Clerk). Lo que devuelve el
// mock es exactamente la forma que `verifyClerkToken` exige, así que el resto del
// camino (withMcpAuth → rate limit → mcp-handler → tools) es el real.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql, hasTestDb } from '../utils/test-db';
import { MCP_RESOURCE_METADATA_PATH } from '@/lib/mcp/paths';
import { RATE_LIMITS } from '@/lib/security/rate-limit';

/** Lo que `auth({ acceptsToken: 'oauth_token' })` devuelve. null = sin mockear. */
let clerkAuthResult: unknown = null;

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => clerkAuthResult,
}));

const { POST, GET } = await import('@/app/api/[transport]/route');

/** Un token OAuth de Clerk válido para el usuario dado. */
function authenticatedAs(userId: string) {
  return {
    isAuthenticated: true,
    tokenType: 'oauth_token',
    clientId: 'mcp-test-client',
    scopes: ['profile'],
    userId,
  };
}

function mcpRequest(init: { token?: string } = {}): Request {
  return new Request('https://app.fahybrid.com/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
}

beforeEach(() => {
  clerkAuthResult = null;
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('/api/mcp — el 401 que arranca el handshake', () => {
  test('sin Authorization: 401 apuntando al metadata del recurso', async () => {
    const res = await POST(mcpRequest());

    expect(res.status).toBe(401);

    const challenge = res.headers.get('www-authenticate');
    expect(challenge).toBeTruthy();
    expect(challenge).toContain('Bearer');
    // ESTA es la línea que hace que un cliente MCP pueda descubrir cómo
    // autenticarse. Sin ella, o con el path por defecto (el well-known "pelado",
    // que describe un recurso montado en la raíz del dominio), el cliente se
    // queda mirando un 401 sin saber a dónde ir.
    expect(challenge).toContain(
      `resource_metadata="https://app.fahybrid.com${MCP_RESOURCE_METADATA_PATH}"`,
    );
  });

  test('con un token que Clerk no reconoce: 401, y no se toca ningún dato', async () => {
    clerkAuthResult = { isAuthenticated: false, tokenType: 'oauth_token' };

    const res = await POST(mcpRequest({ token: 'token-caducado-o-falso' }));

    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('resource_metadata=');
  });

  test('con una sesión de navegador en vez de un token OAuth: 401', async () => {
    // Un cliente que mandase la cookie del panel no entra: la tool exige un
    // token OAuth, y `verifyClerkToken` lanza si el tipo no es el suyo.
    clerkAuthResult = { isAuthenticated: true, tokenType: 'session_token', userId: 'user_x' };

    const res = await POST(mcpRequest({ token: 'una-cookie-de-sesion' }));

    expect(res.status).toBe(401);
  });
});

describe('/api/[transport] — solo sirve transportes reales', () => {
  test('/api/sse responde 404: sin Redis, SSE está apagado a propósito', async () => {
    clerkAuthResult = authenticatedAs('user_sse');
    const res = await GET(
      new Request('https://app.fahybrid.com/api/sse', {
        headers: { authorization: 'Bearer t' },
      }),
    );

    // 404 y no 500: el transporte SSE de mcp-handler 1.x necesita Redis para
    // repartir mensajes entre las dos mitades de la sesión y en este stack no
    // hay Redis. Apagado responde "no existe"; encendido reventaría en la
    // primera petición de un cliente que lo intentase.
    expect(res.status).toBe(404);
  });

  test('un path de API inventado sigue dando 404, no lo traga el segmento dinámico', async () => {
    // `app/api/[transport]` es hermano de ~25 carpetas estáticas. Las estáticas
    // ganan, así que /api/coach y compañía no se ven; pero un path SIN carpeta
    // estática cae aquí, y tiene que seguir siendo un 404 como antes de que este
    // route existiera. Si dejara de serlo, cualquier typo en una URL de la API
    // pasaría a devolver un error de MCP y costaría horas de depuración.
    clerkAuthResult = authenticatedAs('user_typo');
    const res = await GET(
      new Request('https://app.fahybrid.com/api/esto-no-existe', {
        headers: { authorization: 'Bearer t' },
      }),
    );

    expect(res.status).toBe(404);
  });
});

describeWithDb('/api/mcp — el rate limit (DB real)', () => {
  const sql = getTestSql();
  // Clave del bucket tal y como la compone withRateLimit: scope:endpoint:id.
  const clerkUserId = `user_rl_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const bucketKey = `mcp-user:${RATE_LIMITS.mcp.endpoint}:${clerkUserId}`;

  afterEach(async () => {
    if (!hasTestDb()) return;
    await sql`delete from rate_limit_buckets where bucket_key = ${bucketKey}`;
  });

  test('pasado el techo del minuto responde 429 con retry-after', async () => {
    clerkAuthResult = authenticatedAs(clerkUserId);

    // Se rellena la ventana directamente en la tabla en vez de disparar 120
    // peticiones: lo que se prueba es que el handler MIRA el contador y corta,
    // no la aritmética de la ventana (eso ya tiene su suite en tests/security).
    const windowMs = RATE_LIMITS.mcp.windowSec * 1000;
    const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
    await sql`
      insert into rate_limit_buckets (bucket_key, window_start, count, updated_at)
      values (${bucketKey}, ${windowStart}, ${RATE_LIMITS.mcp.limit}, now())
      on conflict (bucket_key, window_start) do update set count = excluded.count
    `;

    const res = await POST(mcpRequest({ token: 'token-bueno' }));

    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);

    // Y el techo es por COACH (por su login), no global: otro coach en el mismo
    // minuto pasa sin enterarse.
    clerkAuthResult = authenticatedAs(`otro_${clerkUserId}`);
    const otro = await POST(mcpRequest({ token: 'token-bueno' }));
    expect(otro.status).not.toBe(429);
    await sql`delete from rate_limit_buckets where bucket_key = ${`mcp-user:${RATE_LIMITS.mcp.endpoint}:otro_${clerkUserId}`}`;
    await closeTestSql();
  });
});
