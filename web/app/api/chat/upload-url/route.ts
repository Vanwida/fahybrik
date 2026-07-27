// POST /api/chat/upload-url
//
// El cliente anuncia el fichero que quiere subir (tipo, nombre, MIME, bytes) y
// recibe una URL de subida prefirmada contra la que hace `PUT <bytes>` DIRECTO
// al almacén. Los bytes jamás pasan por aquí: la plataforma corta el body de
// una función en ~4.5 MB, así que recibirlos por multipart (la ruta anterior)
// hacía imposible cualquier foto grande y todo vídeo. Ver lib/chat/upload.ts.
//
// Auth: principal coach (sube a cualquiera de sus atletas, `athlete_id`
// obligatorio y comprobado) o atleta (solo a su propia carpeta — se ignora
// cualquier athlete_id que mande). La carpeta del blob se deriva del principal,
// nunca del cliente.
//
// Respuesta: { upload_url, attachment_url, content_type, expires_at }. Tras el
// PUT, el cliente manda el mensaje con attachment_url + attachment_kind.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { resolveChatPrincipal } from '@/lib/chat/auth';
import { chatAttachmentKindSchema } from '@/lib/chat/schema';
import { createAttachmentUploadTarget, UploadError } from '@/lib/chat/upload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uploadUrlSchema = z.object({
  kind: chatAttachmentKindSchema,
  filename: z.string().min(1).max(300),
  mime_type: z.string().max(200).optional(),
  size_bytes: z.number().int().positive(),
  athlete_id: z.string().regex(/^\d+$/).optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  const principal = await resolveChatPrincipal(req);
  if (!principal) {
    return jsonError('unauthorized', 'Coach session or athlete bearer required', 401);
  }

  let parsed: z.infer<typeof uploadUrlSchema>;
  try {
    parsed = uploadUrlSchema.parse(await req.json());
  } catch {
    return jsonError('invalid_body', 'Expected { kind, filename, mime_type?, size_bytes }', 400);
  }

  let folderAthleteId: bigint;
  if (principal.role === 'athlete') {
    // Se ignora cualquier athlete_id del body — un atleta solo escribe en su carpeta.
    folderAthleteId = principal.athlete_id;
  } else {
    if (!parsed.athlete_id) {
      return jsonError('missing_athlete_id', 'athlete_id required for coach uploads', 400);
    }
    folderAthleteId = BigInt(parsed.athlete_id);

    // Propiedad: el coach solo sube a la carpeta de un atleta suyo. Un id ajeno
    // se trata como not-found (404) para no revelar atletas de otros coaches.
    const owns = await sql<Array<{ n: number }>>`
      select count(*)::int as n from athletes
      where id = ${folderAthleteId as unknown as number}
        and coach_id = ${principal.coach_id as unknown as number}
    `;
    if ((owns[0]?.n ?? 0) === 0) {
      return jsonError('not_found', 'Athlete not found', 404);
    }
  }

  try {
    const target = await createAttachmentUploadTarget({
      athlete_id: folderAthleteId,
      kind: parsed.kind,
      filename: parsed.filename,
      mime_type: parsed.mime_type ?? '',
      size_bytes: parsed.size_bytes,
    });
    return jsonOk(target, 201);
  } catch (err) {
    if (err instanceof UploadError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}
