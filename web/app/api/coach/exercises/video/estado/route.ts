// GET /api/coach/exercises/video/estado?uid=<uid>
//
// ¿Ya se puede ver el vídeo que se acaba de subir? Un vídeo recién subido NO se
// reproduce: Cloudflare Stream lo transcodifica primero, y darlo por bueno antes de
// tiempo sería prometerle al entrenador un vídeo que su atleta vería en negro. Por eso
// el panel pregunta aquí hasta que la respuesta es `listo`, y sólo entonces hay
// localizador que guardar en el ejercicio.
//
// POR QUÉ PASA POR NOSOTROS (si el vídeo se reproduce sin credencial): porque
// preguntarle a Cloudflare exige la credencial de la CUENTA, que jamás sale al
// navegador. Los bytes siguen sin pasar por aquí: esto son dos números y un estado.
//
// QUIÉN PUEDE PREGUNTAR: cualquier coach con sesión. No se ata al que subió porque no
// hay dónde anotarlo sin inventar una tabla para un dato que caduca en segundos — y no
// hace falta: lo único que se puede sacar de aquí es el estado y el localizador de un
// uid que hay que conocer de antemano (32 hexadecimales que no se adivinan), y ese
// localizador es reproducible por diseño, igual que el enlace de un vídeo no listado.
//
// Respuesta: { state: 'procesando', pct } | { state: 'listo', video_url } |
//            { state: 'error', message }.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { ExerciseVideoError, readExerciseVideoState } from '@/lib/exercises/video-stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** El identificador de un vídeo en Stream: 32 hexadecimales, ni uno más. Se comprueba
 *  la forma ANTES de preguntar para no reenviar a Cloudflare lo que llegue. */
const uidSchema = z.string().regex(/^[0-9a-f]{32}$/);

export async function GET(request: Request): Promise<NextResponse> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const uid = uidSchema.safeParse(new URL(request.url).searchParams.get('uid') ?? '');
  if (!uid.success) return jsonError('bad_request', 'Se esperaba ?uid=<id del vídeo>', 400);

  try {
    return jsonOk(await readExerciseVideoState(uid.data));
  } catch (err) {
    if (err instanceof ExerciseVideoError) {
      return jsonError(err.code, err.message, err.status);
    }
    throw err;
  }
}
