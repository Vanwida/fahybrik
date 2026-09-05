// GET /api/coros/status — el endpoint que un monitor consulta para saber si
// estamos en pie. Lo que estos tests protegen no es el JSON: es que NUNCA baje
// de 200 por una condición que no significa "estamos caídos".
//
// `configured` es DCR self-service (podemos registrar), no Partner COROS_*.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/coros/config', () => ({ loadCorosConfig: vi.fn() }));
vi.mock('@/lib/db', () => ({ sql: vi.fn() }));

const { loadCorosConfig } = await import('@/lib/coros/config');
const { sql } = await import('@/lib/db');
const { GET, HEAD } = await import('@/app/api/coros/status/route');

const configured = {
  ok: true as const,
  config: {
    authorizeEndpoint: 'https://mcpus.coros.com/oauth2/authorize',
    tokenEndpoint: 'https://mcpus.coros.com/oauth2/token',
    revokeEndpoint: 'https://mcpus.coros.com/oauth2/revoke',
    registrationEndpoint: 'https://mcpus.coros.com/connect/register',
    metadataUrl: 'https://mcp.coros.com/.well-known/oauth-authorization-server',
    callbackUrl: 'https://app.fahybrid.com/api/coros/callback',
    mcpUrl: 'https://mcp.coros.com/mcp',
    scopes: 'openid mcp.tools offline_access',
  },
};

describe('GET /api/coros/status', () => {
  beforeEach(() => {
    vi.mocked(loadCorosConfig).mockReset();
    vi.mocked(sql).mockReset();
    vi.mocked(sql).mockResolvedValue([{ ok: 1 }] as never);
  });

  it('responde 200 y configured=true sin Partner COROS_CLIENT_ID / SECRET', async () => {
    // MCP es self-service: DCR puede registrar. Partner env no es la puerta.
    vi.mocked(loadCorosConfig).mockReturnValue(configured as never);

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.integration.configured).toBe(true);
    expect(body.integration.ingest_ready).toBe(true);
  });

  it('responde 200 aunque la base de datos no conteste', async () => {
    // Un hipo de nuestra base de datos no significa que la integración de COROS
    // esté rota. Se reporta en el cuerpo; el código HTTP no se toca.
    vi.mocked(loadCorosConfig).mockReturnValue(configured as never);
    vi.mocked(sql).mockRejectedValue(new Error('connection refused') as never);

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.checks.database).toBe(false);
    expect(body.integration.ingest_ready).toBe(false);
  });

  it('con credenciales y base de datos, declara que puede ingerir', async () => {
    vi.mocked(loadCorosConfig).mockReturnValue(configured as never);

    const body = await (await GET()).json();
    expect(body.integration.configured).toBe(true);
    expect(body.checks.database).toBe(true);
    expect(body.integration.ingest_ready).toBe(true);
  });

  it('nunca se cachea: un monitor tiene que ver el estado de ahora', async () => {
    vi.mocked(loadCorosConfig).mockReturnValue(configured as never);

    const res = await GET();
    expect(res.headers.get('cache-control')).toContain('no-store');
  });

  it('responde a HEAD, que es con lo que comprueban algunos monitores', async () => {
    const res = await HEAD();
    expect(res.status).toBe(200);
  });
});
