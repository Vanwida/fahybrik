// POST /api/coach/exercises/video-url
//
// El coach anuncia el vídeo de técnica que quiere colgar de un ejercicio (nombre,
// MIME, bytes) y recibe una URL de subida PREFIRMADA contra la que hace
// `PUT <bytes>` DIRECTO al almacén. Los bytes no pasan por aquí: la plataforma corta
// el cuerpo de una función en ~4,5 MB y un vídeo de técnica pesa mucho más.
// Ver lib/exercises/video-upload.ts y docs/DECISIONS.md (27-jul).
//
// QUÉ SE VALIDA, EN ESTE ORDEN:
//   1. que quien pide es un COACH (sesión del panel);
//   2. que el ejercicio, SI viene, es suyo o forkeable por él — `loadExerciseScope`
//      responde `own` (la fila entera es suya) o `base` (compartida: su vídeo se
//      guardará como override). Cualquier otra cosa es 404, idéntico a «no existe»,
//      para no revelar el ejercicio de otro coach;
//   3. el formato y el tamaño (en lib/exercises/video-upload.ts).
//
// `exercise_id` es OPCIONAL a propósito: en el alta, el coach sube el vídeo del
// ejercicio que está creando y ese ejercicio todavía no tiene id. No abre ningún
// hueco — la carpeta se deriva de SU sesión, nunca de nada que mande el cliente, y
// el tope y el tipo se firman igual.
//
// Respuesta: { upload_url, video_url, content_type, expires_at }. Tras el PUT, el
// formulario guarda el ejercicio con `video_url` (el localizador relativo).

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { loadExerciseScope } from '@/lib/exercises/coach-override';
import {
  createExerciseVideoUploadTarget,
  ExerciseVideoError,
} from '@/lib/exercises/video-upload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// El tope de bytes NO se repite aquí: lo comprueba `createExerciseVideoUploadTarget`,
// que es el que además lo firma dentro de la URL, y así el «no puede pasar de N MB»
// se dice UNA vez y con el número de verdad. Un `.max()` en este schema sólo
// añadiría un segundo rechazo, más pobre, para el mismo caso.
const videoUrlSchema = z
  .object({
    exercise_id: z.string().regex(/^\d+$/).optional(),
    filename: z.string().min(1).max(300),
    mime_type: z.string().max(200).optional(),
    size_bytes: z.number().int().positive(),
  })
  .strict();

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }
  const parsed = videoUrlSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(
      'bad_request',
      'Se esperaba { filename, mime_type?, size_bytes, exercise_id? }',
      400,
      parsed.error.flatten(),
    );
  }

  if (parsed.data.exercise_id) {
    const scope = await loadExerciseScope(sql, session.coach_id, BigInt(parsed.data.exercise_id));
    if (!scope) return jsonError('not_found', 'Ejercicio no encontrado', 404);
  }

  try {
    const target = await createExerciseVideoUploadTarget({
      coach_id: session.coach_id,
      filename: parsed.data.filename,
      mime_type: parsed.data.mime_type ?? '',
      size_bytes: parsed.data.size_bytes,
    });
    return jsonOk(target, 201);
  } catch (err) {
    if (err instanceof ExerciseVideoError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}
