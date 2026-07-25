// Tests del cliente de Guides: cabeceras, sobre de respuesta, idempotencia del
// 409 y degradado a 503 sin credenciales. El fetch se inyecta; no hay red ni DB.

import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import {
  SuuntoApiError,
  SuuntoGuidesClient,
  type SuuntoGuideItem,
} from '@/lib/wearables/suunto/client';
import { loadSuuntoConfig, suuntoGatedResponse } from '@/lib/wearables/suunto/config';

const BASE = {
  clientId: 'cid',
  clientSecret: 'secret',
  subscriptionKey: 'sub-key',
  tokenEndpoint: 'https://cloudapi-oauth.suunto.com/oauth/token',
  apiBase: 'https://cloudapi.suunto.com',
  tokens: { access_token: 'jwt-token' },
};

const ZIP = new Uint8Array([1, 2, 3, 4]);

function envelope(status: number, payload: unknown, error?: string): Response {
  return new Response(JSON.stringify({ error: error ? { description: error } : null, payload }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const ITEM: SuuntoGuideItem = { id: 'oxrgorwo', name: 'Series', externalId: 'fhb-a42' };

describe('cabeceras y transporte', () => {
  test('toda llamada lleva Bearer + la clave de suscripción', async () => {
    let seen: Request | undefined;
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      seen = new Request(String(url), init as RequestInit);
      return envelope(201, ITEM);
    });
    const client = new SuuntoGuidesClient({ ...BASE, fetchImpl: fetchImpl as typeof fetch });

    await client.createGuide(ZIP, 'fhb-a42');

    expect(String(fetchImpl.mock.calls[0]![0])).toBe('https://cloudapi.suunto.com/v2/guides/files');
    expect(seen!.method).toBe('POST');
    // La FAQ de Suunto es explícita: Authorization: Bearer <jwt token>.
    expect(seen!.headers.get('authorization')).toBe('Bearer jwt-token');
    expect(seen!.headers.get('ocp-apim-subscription-key')).toBe('sub-key');
    expect(seen!.headers.get('content-type')).toBe('application/zip');
  });

  test('el listado traslada offset, limit y fileSince', async () => {
    let requested = '';
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      requested = String(url);
      return envelope(200, [ITEM]);
    });
    const client = new SuuntoGuidesClient({ ...BASE, fetchImpl: fetchImpl as unknown as typeof fetch });

    await client.listGuides({ offset: 50, limit: 25, fileSince: 1634031291729 });

    expect(requested).toBe(
      'https://cloudapi.suunto.com/v2/guides/items?offset=50&limit=25&fileSince=1634031291729',
    );
  });

  test('un 400 conserva la causa que manda la API', async () => {
    const fetchImpl = vi.fn(async () => envelope(400, null, "Invalid step type: 'notfication'"));
    const client = new SuuntoGuidesClient({ ...BASE, fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.createGuide(ZIP)).rejects.toMatchObject({
      name: 'SuuntoApiError',
      status: 400,
      description: "Invalid step type: 'notfication'",
    });
  });
});

describe('idempotencia', () => {
  test('un externalId repetido (409) es ÉXITO, no error', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/v2/guides/items')) return envelope(200, [ITEM]);
      return envelope(409, null, 'Conflict');
    });
    const client = new SuuntoGuidesClient({ ...BASE, fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await client.createGuide(ZIP, 'fhb-a42');

    expect(result.status).toBe('duplicate');
    expect(result.item).toMatchObject({ id: 'oxrgorwo' });
  });

  test('upsert: si ya existe, ACTUALIZA su contenido en vez de duplicar', async () => {
    const methods: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      methods.push(`${method} ${new URL(String(url)).pathname}`);
      if (String(url).includes('/v2/guides/items')) return envelope(200, [ITEM]);
      if (method === 'POST') return envelope(409, null, 'Conflict');
      return envelope(200, { ...ITEM, fileModificationTime: 2 });
    });
    const client = new SuuntoGuidesClient({ ...BASE, fetchImpl: fetchImpl as unknown as typeof fetch });

    const item = await client.upsertGuide(ZIP, 'fhb-a42');

    expect(methods).toEqual([
      'POST /v2/guides/files',
      'GET /v2/guides/items',
      'PUT /v2/guides/files/oxrgorwo',
    ]);
    expect(item.fileModificationTime).toBe(2);
  });

  test('borrar algo que ya no está no rompe', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }));
    const client = new SuuntoGuidesClient({ ...BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.deleteGuide('nope')).resolves.toBeUndefined();
  });

  test('un 409 cuyo guide no aparece SÍ es un error: no inventamos un id', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/v2/guides/items')) return envelope(200, []);
      return envelope(409, null, 'Conflict');
    });
    const client = new SuuntoGuidesClient({ ...BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.upsertGuide(ZIP, 'fhb-a42')).rejects.toBeInstanceOf(SuuntoApiError);
  });
});

describe('degradado sin credenciales', () => {
  const SUUNTO_VARS = [
    'SUUNTO_CLIENT_ID',
    'SUUNTO_CLIENT_SECRET',
    'SUUNTO_SUBSCRIPTION_KEY',
    'SUUNTO_OAUTH_CALLBACK_URL',
    'SUUNTO_GUIDE_OWNER',
  ];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of SUUNTO_VARS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });
  afterEach(() => {
    for (const key of SUUNTO_VARS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  test('sin env, la config no está lista y dice exactamente qué falta', () => {
    const result = loadSuuntoConfig();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('debería faltar configuración');
    expect(result.missing).toEqual(SUUNTO_VARS);
  });

  test('la respuesta de corte es un 503, nunca un 500', async () => {
    const result = loadSuuntoConfig();
    if (result.ok) throw new Error('debería faltar configuración');
    const res = suuntoGatedResponse(result.missing);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'suunto_not_configured', missing_env: SUUNTO_VARS });
  });

  test('con env completo, la config carga con los endpoints oficiales', () => {
    for (const key of SUUNTO_VARS) process.env[key] = 'x';
    const result = loadSuuntoConfig();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('debería cargar');
    expect(result.config.authorizeEndpoint).toBe('https://cloudapi-oauth.suunto.com/oauth/authorize');
    expect(result.config.tokenEndpoint).toBe('https://cloudapi-oauth.suunto.com/oauth/token');
    expect(result.config.apiBase).toBe('https://cloudapi.suunto.com');
    expect(result.config.scopes).toBe('workout');
  });
});
