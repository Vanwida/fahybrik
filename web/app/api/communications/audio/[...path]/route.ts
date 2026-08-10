// GET /api/communications/audio/[...path]
//
// Proxy autenticado de la nota de voz de un comunicado. El fichero vive en un
// blob privado bajo la carpeta del COACH (`comunicados/<coach_id>/…`), así que
// su URL cruda no se puede pedir desde fuera y nunca se le entrega a nadie.
//
// QUIÉN PUEDE OÍRLO, Y POR QUÉ NO SE DECIDE POR LA CARPETA
// -------------------------------------------------------
// El proxy del chat autoriza por carpeta porque un adjunto es de UNA
// conversación. Un comunicado no: se publica a varios atletas a la vez y el
// mismo audio lo oyen los ocho. Por eso aquí la pregunta no es «¿de quién es
// esta carpeta?» sino «¿a quién se le mandó esto?»:
//
//   · al COACH dueño de la carpeta — es su audio, lo grabó él;
//   · a cualquier ATLETA que sea destinatario de un comunicado PUBLICADO que
//     apunte a este audio.
//
// Efecto buscado: el día que el coach retira el comunicado, el audio deja de
// sonar para el atleta sin tener que tocar el almacén. Y un comunicado que
// todavía es borrador no se le puede sacar a nadie.
//
// Se contesta 404 y no 403 cuando no toca: un 403 confirmaría que ese fichero
// existe.

import { NextResponse } from 'next/server';
import { head } from '@vercel/blob';
import { jsonError } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { resolveChatPrincipal } from '@/lib/chat/auth';
import { buildDownstreamHeaders, buildUpstreamHeaders } from '@/lib/attachments/proxy-headers';
import { audioProxyUrl, coachIdFromAudioPathname } from '@/lib/communications/audio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path: string[] }> };

/**
 * ¿Le toca oír este audio?
 *
 * Al coach se le pregunta por la CARPETA (es suya). Al atleta se le pregunta por
 * el DESTINO: existe un comunicado publicado suyo que apunta exactamente a esta
 * URL. La comparación es por la URL completa y no por el pathname porque es lo
 * que se guarda en la columna, y así no hay dos formas de escribir lo mismo.
 */
async function puedeOir(
  principal: NonNullable<Awaited<ReturnType<typeof resolveChatPrincipal>>>,
  pathname: string,
): Promise<boolean> {
  if (principal.role === 'coach') {
    return coachIdFromAudioPathname(pathname) === principal.coach_id;
  }
  const rows = await sql<{ n: number }[]>`
    select 1 as n
    from coach_communications c
    join coach_communication_recipients r on r.communication_id = c.id
    where c.audio_url = ${audioProxyUrl(pathname)}
      and r.athlete_id = ${principal.athlete_id as unknown as number}
      and c.status = 'published'
    limit 1
  `;
  return rows.length > 0;
}

export async function GET(req: Request, ctx: Ctx): Promise<NextResponse | Response> {
  const principal = await resolveChatPrincipal(req);
  if (!principal) {
    return jsonError('unauthorized', 'Sesión de coach o token de atleta requeridos', 401);
  }

  const { path } = await ctx.params;
  // Los tramos vienen codificados de uno en uno (`audioProxyUrl`).
  const pathname = path.map((s) => decodeURIComponent(s)).join('/');
  if (coachIdFromAudioPathname(pathname) == null) {
    return jsonError('not_found', 'Audio no encontrado', 404);
  }

  if (!(await puedeOir(principal, pathname))) {
    return jsonError('not_found', 'Audio no encontrado', 404);
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) {
    return jsonError('storage_unavailable', 'El almacén no está configurado', 503);
  }

  // `head` resuelve la URL privada del blob y de paso confirma que existe.
  let blobUrl: string;
  try {
    blobUrl = (await head(pathname, { token: blobToken })).url;
  } catch {
    return jsonError('not_found', 'Audio no encontrado', 404);
  }
  const upstream = await fetch(blobUrl, {
    headers: buildUpstreamHeaders(req, blobToken),
    cache: 'no-store',
  });
  if (!upstream.ok && upstream.status !== 206) {
    return jsonError('not_found', 'Audio no encontrado', 404);
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: buildDownstreamHeaders(upstream),
  });
}
