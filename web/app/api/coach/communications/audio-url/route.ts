// POST /api/coach/communications/audio-url
//
// El coach anuncia la nota de voz que quiere adjuntar a un comunicado (nombre,
// MIME, bytes) y recibe una URL de subida prefirmada contra la que hace
// `PUT <bytes>` DIRECTO al almacén. Los bytes no pasan por aquí: la plataforma
// corta el cuerpo de una función en ~4,5 MB y una nota de voz de diez minutos no
// cabría. Ver lib/communications/audio.ts.
//
// SIN `athlete_id`, y ésa es la diferencia con la subida del chat. El audio de
// un comunicado se publica a VARIOS atletas y también existe antes de tener
// destinatario (una plantilla en la biblioteca), así que su dueño es el COACH y
// la carpeta se deriva de SU sesión, nunca de nada que mande el cliente.
//
// Respuesta: { upload_url, audio_url, content_type, expires_at }. Tras el PUT, el
// compositor manda el comunicado con `audio_url` + `audio_seconds`.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  CommunicationAudioError,
  createCommunicationAudioUploadTarget,
} from '@/lib/communications/audio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const audioUrlSchema = z.object({
  filename: z.string().min(1).max(300),
  mime_type: z.string().max(200).optional(),
  size_bytes: z.number().int().positive(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let parsed: z.infer<typeof audioUrlSchema>;
  try {
    parsed = audioUrlSchema.parse(await request.json());
  } catch {
    return jsonError('bad_request', 'Se esperaba { filename, mime_type?, size_bytes }', 400);
  }

  try {
    const target = await createCommunicationAudioUploadTarget({
      coach_id: session.coach_id,
      filename: parsed.filename,
      mime_type: parsed.mime_type ?? '',
      size_bytes: parsed.size_bytes,
    });
    return jsonOk(target, 201);
  } catch (err) {
    if (err instanceof CommunicationAudioError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}
