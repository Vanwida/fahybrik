// GET /api/exercises/video/[...key]
//
// Proxy autenticado del vídeo de técnica que subió el entrenador. El fichero vive en
// un blob PRIVADO bajo su carpeta (`ejercicios/<coach_id>/…`), así que su URL cruda
// no se puede pedir desde fuera y nunca se le entrega a nadie: los bytes pasan por
// aquí, que comprueba antes quién mira.
//
// QUIÉN PUEDE VERLO
// -----------------
// Las DOS superficies, porque el vídeo existe para las dos:
//   · el COACH dueño de la carpeta — es su vídeo, lo grabó él y lo ve mientras edita
//     el ejercicio (incluso antes de guardarlo);
//   · cualquier ATLETA de ese coach — un vídeo de técnica es CATÁLOGO: se cuelga del
//     ejercicio, no de una sesión, y lo abre quien tenga ese ejercicio delante.
//
// Y por eso la pregunta es «¿de quién es esta carpeta?» y no «¿hay un ejercicio que
// apunte aquí?»: en el alta el coach sube el vídeo ANTES de que el ejercicio exista,
// y una comprobación contra la base le daría un 404 justo donde tiene que ver lo que
// acaba de subir. Lo que sí queda cerrado es el ámbito: el vídeo de un coach jamás
// se le sirve al atleta de otro.
//
// Se contesta 404 y no 403 cuando no toca: un 403 confirmaría que ese fichero existe.
//
// El import de `@vercel/blob` es ESTÁTICO. Cargarlo con `new Function` dejaba el
// paquete fuera del bundle desplegado y la ruta contestaba 404 siempre, en silencio
// (docs/DECISIONS.md, 26-jul).

import { NextResponse } from 'next/server';
import { head } from '@vercel/blob';
import { jsonError } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { resolveChatPrincipal } from '@/lib/chat/auth';
import { buildDownstreamHeaders, buildUpstreamHeaders } from '@/lib/attachments/proxy-headers';
import { coachIdFromExerciseVideoPathname } from '@/lib/exercises/video-source';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ key: string[] }> };

/**
 * ¿Le toca ver este vídeo? Al coach se le pregunta por la CARPETA (es suya). Al
 * atleta, por su entrenador: el dueño de la carpeta tiene que ser el coach que le
 * entrena. Un atleta sin coach no ve ninguno.
 */
async function puedeVer(
  principal: NonNullable<Awaited<ReturnType<typeof resolveChatPrincipal>>>,
  ownerCoachId: bigint,
): Promise<boolean> {
  if (principal.role === 'coach') {
    return principal.coach_id === ownerCoachId;
  }
  const rows = await sql<{ n: number }[]>`
    select 1 as n
    from athletes
    where id = ${principal.athlete_id as unknown as number}
      and coach_id = ${ownerCoachId as unknown as number}
    limit 1
  `;
  return rows.length > 0;
}

export async function GET(req: Request, ctx: Ctx): Promise<NextResponse | Response> {
  const principal = await resolveChatPrincipal(req);
  if (!principal) {
    return jsonError('unauthorized', 'Sesión de coach o token de atleta requeridos', 401);
  }

  const { key } = await ctx.params;
  // Los tramos vienen codificados de uno en uno (`exerciseVideoLocator`).
  let pathname: string;
  try {
    pathname = key.map((s) => decodeURIComponent(s)).join('/');
  } catch {
    return jsonError('not_found', 'Vídeo no encontrado', 404);
  }

  // La forma del pathname es lo que dice de quién es. Null = no tiene NUESTRA forma:
  // nunca se confía en una ruta que llega de fuera.
  const ownerCoachId = coachIdFromExerciseVideoPathname(pathname);
  if (ownerCoachId == null) {
    return jsonError('not_found', 'Vídeo no encontrado', 404);
  }

  if (!(await puedeVer(principal, ownerCoachId))) {
    return jsonError('not_found', 'Vídeo no encontrado', 404);
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
    return jsonError('not_found', 'Vídeo no encontrado', 404);
  }
  // Se reenvía `Range` para que el vídeo se pueda adelantar sin descargarlo entero.
  const upstream = await fetch(blobUrl, {
    headers: buildUpstreamHeaders(req, blobToken),
    cache: 'no-store',
  });
  if (!upstream.ok && upstream.status !== 206) {
    return jsonError('not_found', 'Vídeo no encontrado', 404);
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: buildDownstreamHeaders(upstream),
  });
}
