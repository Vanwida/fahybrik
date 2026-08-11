// POST /api/coach/exercises/video/subida
//
// El entrenador anuncia el vídeo de técnica que quiere colgar de un ejercicio y recibe
// una dirección de subida DE UN SOLO USO contra la que el navegador hace
// `POST <fichero>` DIRECTO a Cloudflare Stream. Los bytes no pasan por aquí: la
// plataforma corta el cuerpo de una función en ~4,5 MB y un vídeo pesa mucho más, y
// además nuestro cómputo es justo el cuello de botella para escalar a muchos
// entrenadores. Ver lib/exercises/video-stream.ts.
//
// QUÉ SE VALIDA, EN ESTE ORDEN:
//   1. que quien pide es un COACH (sesión del panel);
//   2. que el ejercicio, SI viene, es suyo o forkeable por él — `loadExerciseScope`
//      responde `own` (la fila entera es suya) o `base` (compartida: su vídeo se
//      guardará como override). Cualquier otra cosa es 404, idéntico a «no existe»,
//      para no revelar el ejercicio de otro coach;
//   3. el formato (en lib/exercises/video-stream.ts, que además firma la duración).
//
// `exercise_id` es OPCIONAL a propósito: en el alta, el entrenador sube el vídeo del
// ejercicio que está creando y ese ejercicio todavía no tiene id. No abre ningún
// hueco — la reserva se anota a SU sesión, nunca a nada que mande el cliente.
//
// Respuesta: { upload_url, uid, expires_at }. Y NO un localizador: un vídeo recién
// subido todavía no se puede ver, así que aquí no hay nada que guardar. El localizador
// lo da `GET ../estado` cuando Stream termina.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { loadExerciseScope } from '@/lib/exercises/coach-override';
import {
  createExerciseVideoUploadTarget,
  ExerciseVideoError,
} from '@/lib/exercises/video-stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Ni el tamaño ni la duración se declaran: el tamaño no se puede comprobar desde aquí
// (los bytes no pasan por nosotros) y la duración la hace cumplir Cloudflare con lo
// que va firmado en la reserva. Pedirlos sería teatro.
const subidaSchema = z
  .object({
    exercise_id: z.string().regex(/^\d+$/).optional(),
    filename: z.string().min(1).max(300),
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
  const parsed = subidaSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(
      'bad_request',
      'Se esperaba { filename, exercise_id? }',
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
    });
    return jsonOk(target, 201);
  } catch (err) {
    if (err instanceof ExerciseVideoError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}
