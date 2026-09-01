import 'server-only';

// HABLAR CON CLOUDFLARE — la parte que es igual para todo lo que alojamos allí.
//
// Tenemos dos cosas viviendo en Cloudflare y van a ser más: el vídeo de técnica del
// entrenador (Stream) y la foto de perfil de las personas (Images). La cuenta es la
// misma, la credencial es la misma, el sobre de la respuesta es el mismo y la forma de
// fallar tiene que ser la misma. Eso es lo que vive aquí.
//
// LO QUE **NO** VIVE AQUÍ: qué es un vídeo, qué es un retrato, qué formatos se admiten
// o cómo se construye un localizador. Eso es de cada dominio. Este módulo sólo sabe de
// transporte.
//
// POR QUÉ UN SOBRE PROPIO: la API de Cloudflare responde SIEMPRE 200 con
// `{ success, result, errors }`, así que mirar el código HTTP no basta — un fallo de
// verdad llega dentro del cuerpo. Desenvolverlo en un solo sitio evita que la próxima
// integración se olvide de mirar `success` y dé por bueno un `result` vacío.

/** La API de Cloudflare. */
const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

/**
 * Un fallo del alojamiento, ya escrito para quien lo pidió: trae el código y el estado
 * HTTP con los que va a salir por la ruta. Lo lanzan tanto los módulos de Stream como
 * los de Images, y las rutas lo capturan UNA vez.
 *
 * También lo usan las validaciones previas de cada dominio (un formato que no se
 * admite), porque para la ruta son lo mismo: un motivo ya redactado con su estado.
 */
export class CloudflareMediaError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = 'CloudflareMediaError';
  }
}

interface CloudflareEnvelope<T> {
  success: boolean;
  result: T | null;
  errors: { code: number; message: string }[];
}

/**
 * Cuenta y credencial, o un 503 honesto. Nunca se cae en silencio a otro camino: el
 * respaldo mudo es lo que enmascaró durante semanas que en producción no se guardaba
 * nada.
 */
function credenciales(): { accountId: string; token: string } {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) {
    throw new CloudflareMediaError(
      'storage_unavailable',
      'El alojamiento de medios no está configurado',
      503,
    );
  }
  return { accountId, token };
}

interface CloudflareFetchOptions extends RequestInit {
  /**
   * Cuando es cierto, un 404 devuelve `null` en vez de reventar. Es la diferencia
   * entre «ese fichero no existe» —una respuesta legítima que el dominio sabe
   * interpretar— y «Cloudflare está caído», que no lo es.
   */
  allowMissing?: boolean;
}

/**
 * Una llamada a la cuenta, con su sobre desenvuelto. `path` cuelga de
 * `/accounts/<id>` — p. ej. `/stream/direct_upload` o `/images/v1/<id>`.
 *
 * Sin red de seguridad a propósito: si Cloudflare no contesta lo que debe, que se vea.
 * El `content-type` NO se fuerza: hay endpoints que piden JSON y otros que piden un
 * formulario, y quien llama ya sabe cuál es el suyo (con `FormData` lo pone el propio
 * `fetch`, con su separador).
 */
export async function cloudflareAccountFetch<T>(
  path: string,
  init: CloudflareFetchOptions = {},
): Promise<T | null> {
  const { accountId, token } = credenciales();
  const { allowMissing = false, ...request } = init;

  let res: Response;
  try {
    res = await fetch(`${CLOUDFLARE_API_BASE}/accounts/${accountId}${path}`, {
      ...request,
      headers: { authorization: `Bearer ${token}`, ...(request.headers ?? {}) },
      cache: 'no-store',
    });
  } catch (err) {
    throw new CloudflareMediaError(
      'storage_unavailable',
      `No se pudo hablar con el alojamiento de medios: ${
        err instanceof Error ? err.message : 'error de red'
      }`,
      502,
    );
  }

  if (allowMissing && res.status === 404) return null;

  let body: CloudflareEnvelope<T> | null = null;
  try {
    body = (await res.json()) as CloudflareEnvelope<T>;
  } catch {
    body = null;
  }
  if (!res.ok || !body?.success || body.result == null) {
    const motivo = body?.errors?.[0]?.message ?? `respuesta ${res.status}`;
    throw new CloudflareMediaError(
      'storage_unavailable',
      `El alojamiento de medios falló: ${motivo}`,
      502,
    );
  }
  return body.result;
}

/**
 * Igual que la anterior pero para las llamadas en las que un `null` no es una
 * respuesta: o hay resultado o hay error. Evita que cada llamante tenga que descartar
 * un `null` que su endpoint nunca va a devolver.
 */
export async function cloudflareAccountFetchRequired<T>(
  path: string,
  init: Omit<CloudflareFetchOptions, 'allowMissing'> = {},
): Promise<T> {
  const result = await cloudflareAccountFetch<T>(path, init);
  if (result == null) {
    throw new CloudflareMediaError('storage_unavailable', 'El alojamiento de medios falló', 502);
  }
  return result;
}
