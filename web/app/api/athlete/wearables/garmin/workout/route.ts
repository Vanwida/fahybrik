// GET /api/athlete/wearables/garmin/workout   (bearer de atleta)
//
// Devuelve el entreno de carrera de HOY como fichero .FIT de workout, que es lo que
// la app Connect IQ descarga para lanzar el REPRODUCTOR NATIVO del Garmin. La app
// del reloj no interpreta nada: baja el fichero y se lo da al sistema.
//
//   ?assignment_id=<id>  opcional — una sesión concreta en vez de la de hoy.
//
//   200  el .FIT (application/vnd.ant.fit)
//   401  unauthorized          — sin bearer de atleta válido
//   404  no_session_today      — hoy no hay sesión asignada
//   404  not_found             — la asignación pedida no existe o no es suya
//   409  not_a_run_session     — la sesión existe pero no es de carrera
//   422  workout_not_encodable — es de carrera pero sus datos no dan un fichero válido
//
// POR QUÉ 409 Y NO UN FICHERO DEGRADADO
// -------------------------------------
// Fuerza, EMOM y AMRAP no los modela NINGÚN formato de fabricante: solo saben de
// cardio por intervalos. Degradarlos a "N iteraciones de 60 s" perdería las
// repeticiones, la carga y las rondas — el sistema dejaría de saber qué trabajo se
// hizo. Esas sesiones se ejecutan íntegras en nuestras apps. El 409 dice justo eso.

import { z } from 'zod';
import { NextResponse } from 'next/server';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError } from '@/lib/api/responses';
import {
  encodeWorkoutFit,
  toFitSerialNumber,
  FitEncodeError,
  FIT_CONTENT_TYPE,
} from '@/lib/wearables/fit/workout-encoder';
import { loadRunWatchWorkout } from '@/lib/wearables/watch-workout-source';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const assignmentIdSchema = z.coerce.bigint().positive();

/**
 * Nombre estable: la misma sesión produce siempre el mismo fichero, así que
 * re-descargarla lo REEMPLAZA en el reloj en vez de acumular copias. Sin marca en
 * el nombre — el software es agnóstico.
 */
function fitFilename(iso_date: string, assignment_id: string): string {
  return `entreno-${iso_date}-${assignment_id}.fit`;
}

export async function GET(request: Request): Promise<Response> {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const rawAssignmentId = new URL(request.url).searchParams.get('assignment_id');
  let assignment_id: bigint | undefined;
  if (rawAssignmentId !== null) {
    const parsed = assignmentIdSchema.safeParse(rawAssignmentId);
    if (!parsed.success) {
      return jsonError('invalid_request', 'assignment_id no es un identificador válido', 400);
    }
    assignment_id = parsed.data;
  }

  const result = await loadRunWatchWorkout({
    athlete_id: auth.athlete_id,
    user_id: auth.user_id,
    ...(assignment_id === undefined ? {} : { assignment_id }),
  });

  if (!result.ok) {
    switch (result.reason) {
      case 'no_session_today':
        return jsonError('no_session_today', 'Hoy no tienes ningún entreno asignado', 404);
      case 'not_found':
        return jsonError('not_found', 'Ese entreno no existe', 404);
      case 'not_a_run_session':
        return jsonError(
          'not_a_run_session',
          `"${result.title}" no es un entreno de carrera: se hace en la app, no en el reloj`,
          409,
        );
    }
  }

  let bytes: Uint8Array;
  try {
    bytes = encodeWorkoutFit(result.workout, {
      // El serial identifica el fichero junto con tipo/fabricante/producto: atarlo
      // a la asignación es lo que hace que la descarga sea idempotente.
      serialNumber: toFitSerialNumber(BigInt(result.assignment_id)),
    });
  } catch (error) {
    if (error instanceof FitEncodeError) {
      return jsonError('workout_not_encodable', error.message, 422);
    }
    throw error;
  }

  // Se copia a un búfer propio: el `Uint8Array` del codificador puede ser una vista
  // sobre uno mayor y el cuerpo debe llevar EXACTAMENTE los bytes útiles.
  const body = new Uint8Array(bytes);

  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': FIT_CONTENT_TYPE,
      'content-length': String(bytes.byteLength),
      'content-disposition': `attachment; filename="${fitFilename(result.iso_date, result.assignment_id)}"`,
      // El plan cambia (el coach reprograma, el atleta mueve la sesión): el reloj
      // debe recibir siempre la versión de ahora, nunca una cacheada.
      'cache-control': 'no-store',
    },
  });
}
