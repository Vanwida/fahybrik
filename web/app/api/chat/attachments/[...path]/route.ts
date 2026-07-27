// GET /api/chat/attachments/[...path]
//
// Proxy autenticado de los adjuntos del chat. Los ficheros viven en Vercel Blob
// con `access: 'private'`, así que la URL cruda del blob NO se puede pedir desde
// fuera. Los clientes (dashboard e iOS) piden esta ruta con el pathname opaco;
// aquí se comprueba que quien mira pertenece al hilo (el atleta, al suyo; el
// coach, a un atleta de su cohorte) y se le sirven los bytes.
//
// El athlete_id dueño va codificado en la forma del pathname
// (chat/<athlete_id>/<yyyy>/<mm>/<fichero>), así que la propiedad se comprueba
// contra ESE id y nunca contra algo que mande el que llama.
//
// POR QUÉ SE SIRVEN LOS BYTES EN VEZ DE REDIRIGIR
// ----------------------------------------------
// La versión anterior redirigía a una URL firmada que sacaba de
// `getDownloadUrl(pathname)`. Esa función es SÍNCRONA, espera una URL de blob y
// no acepta token: con un pathname lanzaba "Invalid URL", el `catch` la mandaba
// al camino de disco local y la ruta contestaba 404. Verificado contra el blob de
// producción: NINGÚN adjunto del chat se ha podido abrir jamás. Ni las fotos del
// atleta ni las notas de voz del coach.
//
// Firmar la URL de verdad (`issueSignedToken` + `presignUrl`) es un baile pensado
// para que firme el navegador, y aquí no hace falta: pasando los bytes por esta
// función el control de acceso se queda entero de nuestro lado y no hay ningún
// enlace firmado que pueda reenviarse por ahí. Se reenvía la cabecera `Range`
// para que un vídeo se pueda adelantar sin descargarlo entero.
//
// El import de `@vercel/blob` es ESTÁTICO. Cargarlo con `new Function` dejaba el
// paquete fuera del bundle desplegado y esta ruta contestaba 404 siempre, en
// silencio. Ver el bloque equivalente en lib/chat/upload.ts.

import { NextResponse } from 'next/server';
import { head } from '@vercel/blob';
import { jsonError } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { resolveChatPrincipal } from '@/lib/chat/auth';
import { athleteIdFromPathname } from '@/lib/chat/upload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path: string[] }> };

/** Cabeceras que se reenvían HACIA el blob. `Range` es la que permite adelantar
 *  un vídeo sin bajárselo entero, y `if-none-match` la que evita repetir bytes
 *  que el navegador ya tiene. */
export function buildUpstreamHeaders(req: Request, token: string): Headers {
  const headers = new Headers({ authorization: `Bearer ${token}` });
  for (const name of ['range', 'if-none-match', 'if-modified-since'] as const) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

/** Cabeceras que se devuelven al cliente. Se copian las que describen el
 *  contenido y las que hacen posible el salto dentro de un vídeo. El caché es
 *  PRIVADO: el fichero es de una conversación entre dos personas y no puede
 *  quedarse en ninguna caché compartida por el camino. */
export function buildDownstreamHeaders(upstream: Response): Headers {
  const headers = new Headers({
    'cache-control': 'private, max-age=300',
    // El navegador respeta el content-type que declaramos y no se pone a
    // adivinarlo por el contenido. Sin esto, un fichero subido como .txt pero con
    // HTML dentro podría ejecutarse en nuestro propio dominio.
    'x-content-type-options': 'nosniff',
  });
  for (const name of [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'etag',
    'last-modified',
  ] as const) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has('accept-ranges')) headers.set('accept-ranges', 'bytes');
  return headers;
}

async function principalOwnsAthlete(
  principal: NonNullable<Awaited<ReturnType<typeof resolveChatPrincipal>>>,
  athleteId: bigint,
): Promise<boolean> {
  if (principal.role === 'athlete') {
    return principal.athlete_id === athleteId;
  }
  // Coach: the athlete must belong to their cohort.
  const rows = await sql<{ n: number }[]>`
    select count(*)::int as n from athletes
    where id = ${athleteId as unknown as number}
      and coach_id = ${principal.coach_id as unknown as number}
  `;
  return (rows[0]?.n ?? 0) > 0;
}

export async function GET(req: Request, ctx: Ctx): Promise<NextResponse | Response> {
  const principal = await resolveChatPrincipal(req);
  if (!principal) {
    return jsonError('unauthorized', 'Coach session or athlete bearer required', 401);
  }

  const { path } = await ctx.params;
  // The catch-all segments are individually URL-encoded by attachmentProxyUrl.
  const pathname = path.map((s) => decodeURIComponent(s)).join('/');

  const owningAthleteId = athleteIdFromPathname(pathname);
  if (owningAthleteId == null) {
    return jsonError('not_found', 'Attachment not found', 404);
  }

  // Ownership gate. Use 404 (not 403) so we don't disclose existence of other
  // athletes' attachments.
  const owns = await principalOwnsAthlete(principal, owningAthleteId);
  if (!owns) {
    return jsonError('not_found', 'Attachment not found', 404);
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) {
    // Sin almacén no hay adjuntos, ni en desarrollo. El fallback a disco que
    // vivía aquí murió con la subida por multipart: ya nada escribe en disco.
    return jsonError('storage_unavailable', 'Blob storage is not configured', 503);
  }

  // `head` resuelve la URL privada del blob y de paso confirma que existe.
  let blobUrl: string;
  try {
    blobUrl = (await head(pathname, { token: blobToken })).url;
  } catch {
    return jsonError('not_found', 'Attachment not found', 404);
  }
  const upstream = await fetch(blobUrl, {
    headers: buildUpstreamHeaders(req, blobToken),
    cache: 'no-store',
  });
  if (!upstream.ok && upstream.status !== 206) {
    return jsonError('not_found', 'Attachment not found', 404);
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: buildDownstreamHeaders(upstream),
  });
}
