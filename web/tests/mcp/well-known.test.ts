// Los dos documentos .well-known del conector: públicos, JSON y sin auth.
//
// POR QUÉ IMPORTA QUE SEAN PÚBLICOS
// ---------------------------------
// Son lo PRIMERO que pide un cliente MCP, cuando todavía no tiene token: el 401
// de /api/mcp le devuelve `WWW-Authenticate: … resource_metadata="<url>"`, va a
// esa URL y ahí aprende que el servidor de autorización es Clerk. Si alguna de
// las dos quedara detrás del gate de Clerk, el handshake se muerde la cola y el
// conector no se puede conectar nunca. Ese es exactamente el fallo reportado en
// abril-2026 que el plan lista como riesgo principal de esta fase.
//
// El path del segundo NO es decorativo: RFC 9728 lo localiza en
// /.well-known/oauth-protected-resource + el path del recurso, así que un recurso
// en /api/mcp se describe en /.well-known/oauth-protected-resource/api/mcp. El
// test lo comprueba contra `resource`, que es donde se vería la discrepancia.
//
// Lo único simulado es la RED de Clerk (el metadata del servidor de autorización
// se lo pide a la FAPI por HTTP). La regla del repo es no simular la base de
// datos; un tercero por HTTP sí, o el test dependería de que Clerk esté arriba.

import { afterEach, beforeAll, expect, test, describe, vi } from 'vitest';

// Clave publicable sintética: `pk_test_<base64 de "clerk.mcp-test.example.com$">`.
// @clerk/mcp-tools deriva la URL de la FAPI decodificándola, así que tiene que ser
// base64 real, pero NO es un secreto ni apunta a ninguna instancia nuestra.
const TEST_PUBLISHABLE_KEY = 'pk_test_Y2xlcmsubWNwLXRlc3QuZXhhbXBsZS5jb20k';
const TEST_FAPI_ORIGIN = 'https://clerk.mcp-test.example.com';

const CLERK_AUTH_SERVER_METADATA = {
  issuer: TEST_FAPI_ORIGIN,
  authorization_endpoint: `${TEST_FAPI_ORIGIN}/oauth/authorize`,
  token_endpoint: `${TEST_FAPI_ORIGIN}/oauth/token`,
  registration_endpoint: `${TEST_FAPI_ORIGIN}/oauth/register`,
  response_types_supported: ['code'],
  code_challenge_methods_supported: ['S256'],
};

// `protectedResourceHandlerClerk` deriva el `resource` de la petición (para
// respetar los headers de proxy de Vercel), así que su GET sí recibe la Request;
// el de Clerk para el servidor de autorización no la necesita.
let protectedResourceGET: (req: Request) => Response | Promise<Response>;
let protectedResourceOPTIONS: () => Response | Promise<Response>;
let authServerGET: () => Response | Promise<Response>;
let authServerOPTIONS: () => Response | Promise<Response>;

/** La petición tal y como llega en producción, por HTTPS y al path del recurso. */
function metadataRequest(): Request {
  return new Request(
    'https://app.fahybrid.com/.well-known/oauth-protected-resource/api/mcp',
  );
}

beforeAll(async () => {
  // Los handlers leen la clave al ATENDER, no al importar, pero la dejamos puesta
  // antes de importar para no depender de ese detalle.
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = TEST_PUBLISHABLE_KEY;

  ({ GET: protectedResourceGET, OPTIONS: protectedResourceOPTIONS } = await import(
    '@/app/.well-known/oauth-protected-resource/api/mcp/route'
  ));
  ({ GET: authServerGET, OPTIONS: authServerOPTIONS } = await import(
    '@/app/.well-known/oauth-authorization-server/route'
  ));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('/.well-known/oauth-protected-resource/api/mcp', () => {
  test('200 con JSON de metadata, sin ninguna credencial', async () => {
    const res = await protectedResourceGET(metadataRequest());

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');

    const body = (await res.json()) as {
      resource: string;
      authorization_servers: string[];
      bearer_methods_supported?: string[];
    };

    // El recurso descrito es el servidor MCP, no la raíz del dominio: si esto
    // dejara de acabar en /api/mcp, el path de esta carpeta habría dejado de
    // espejar el del recurso y los clientes no sabrían autenticarse.
    expect(body.resource.endsWith('/api/mcp')).toBe(true);
    // Y apunta a NUESTRA instancia de Clerk como servidor de autorización.
    expect(body.authorization_servers).toContain(TEST_FAPI_ORIGIN);
    expect(body.bearer_methods_supported).toEqual(['header']);
  });

  test('el recurso anunciado es el que dialó el cliente, no el interno de Vercel', async () => {
    // Detrás del proxy, `req.url` puede ser el host interno. Si el `resource`
    // saliera con ese host, el cliente vería que no es el servidor con el que
    // está hablando y abandonaría.
    const res = await protectedResourceGET(
      new Request('http://localhost:3456/.well-known/oauth-protected-resource/api/mcp', {
        headers: { 'x-forwarded-host': 'app.fahybrid.com', 'x-forwarded-proto': 'https' },
      }),
    );

    const body = (await res.json()) as { resource: string };
    expect(body.resource).toBe('https://app.fahybrid.com/api/mcp');
  });

  test('sin Clerk configurado responde 500, no un metadata que miente', async () => {
    const saved = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    try {
      const res = await protectedResourceGET(metadataRequest());
      expect(res.status).toBe(500);
      // Incluso el error lleva CORS: un cliente de navegador tiene que poder
      // leer el motivo en vez de recibir un fallo opaco de CORS.
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    } finally {
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = saved;
    }
  });

  test('el preflight CORS pasa (los clientes MCP de navegador lo hacen)', async () => {
    const res = await protectedResourceOPTIONS();

    expect(res.status).toBeLessThan(300);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  test('el path del documento y el que anuncia el 401 son el mismo string', async () => {
    // El fallo que esto cierra no da error en ninguna parte: el 401 apunta a un
    // sitio y el documento vive en otro, y el cliente se queda sin poder
    // descubrir cómo autenticarse. La constante es única y esta suite importa el
    // route por su ruta real, así que mover la carpeta rompe aquí.
    const { MCP_RESOURCE_METADATA_PATH, MCP_RESOURCE_PATH } = await import('@/lib/mcp/paths');
    expect(MCP_RESOURCE_PATH).toBe('/api/mcp');
    expect(MCP_RESOURCE_METADATA_PATH).toBe('/.well-known/oauth-protected-resource/api/mcp');
  });
});

describe('/.well-known/oauth-authorization-server', () => {
  test('200 con el metadata de Clerk, sin ninguna credencial', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      expect(url).toBe(`${TEST_FAPI_ORIGIN}/.well-known/oauth-authorization-server`);
      return new Response(JSON.stringify(CLERK_AUTH_SERVER_METADATA), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await authServerGET();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');

    const body = (await res.json()) as { issuer: string; registration_endpoint?: string };
    expect(body.issuer).toBe(TEST_FAPI_ORIGIN);
    // `registration_endpoint` es lo que permite que un cliente se dé de alta solo
    // (DCR). Sin él, cada cliente hay que registrarlo a mano en el dashboard.
    expect(body.registration_endpoint).toBe(`${TEST_FAPI_ORIGIN}/oauth/register`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('el preflight CORS pasa', async () => {
    const res = await authServerOPTIONS();

    expect(res.status).toBeLessThan(300);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});
