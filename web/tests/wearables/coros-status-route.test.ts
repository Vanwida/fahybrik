// GET /api/coros/status — el endpoint que COROS consulta para saber si estamos en
// pie. Lo que estos tests protegen no es el JSON: es que NUNCA baje de 200 por una
// condición que no significa "estamos caídos".
//
// El riesgo real: durante la revisión de nuestra solicitud no tenemos aún sus
// credenciales. Si por eso devolviéramos 503, su monitor concluiría que el servicio
// está muerto — y lo haría justo mientras deciden si aprobarnos.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/coros/config', () => ({ loadCorosConfig: vi.fn() }));
vi.mock('@/lib/db', () => ({ sql: vi.fn() }));

const { loadCorosConfig } = await import('@/lib/coros/config');
const { sql } = await import('@/lib/db');
const { GET, HEAD } = await import('@/app/api/coros/status/route');

const gated = { ok: false as const, missing: ['COROS_CLIENT_ID'] };
const configured = {
  ok: true as const,
  config: {
    clientId: 'x',
    clientSecret: 'y',
    authorizeEndpoint: 'https://open.coros.com/oauth2/authorize',
    tokenEndpoint: 'https://open.coros.com/oauth2/token',
    callbackUrl: 'https://fahybrid.com/api/coros/callback',
  },
};

describe('GET /api/coros/status', () => {
  beforeEach(() => {
    vi.mocked(loadCorosConfig).mockReset();
    vi.mocked(sql).mockReset();
    vi.mocked(sql).mockResolvedValue([{ ok: 1 }] as never);
  });

  it('responde 200 aunque NO tengamos todavía las credenciales de COROS', async () => {
    // El caso de hoy mismo: solicitud enviada, esperando aprobación.
    vi.mocked(loadCorosConfig).mockReturnValue(gated as never);

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('ok');
    // Y lo dice con honestidad en el cuerpo, sin fingir que está todo listo.
    expect(body.integration.configured).toBe(false);
    expect(body.integration.ingest_ready).toBe(false);
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
