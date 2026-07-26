// GET /api/athlete/wearables/garmin/today?date=YYYY-MM-DD   (bearer de atleta)
//
// El entreno del día para la app Connect IQ del reloj. Es la pieza que la app
// llevaba esperando: su `Config.mc` declaraba este contrato como "ASUMIDO — lo
// construye otro agente" y nunca se construyó, así que la app compilaba, dejaba
// vincular la cuenta y se comía un 404 en la pantalla siguiente.
//
// POR QUÉ LA FECHA VIENE DEL RELOJ Y NO SE RESUELVE AQUÍ
// -----------------------------------------------------
// El atleta puede estar en otro huso horario. Su "hoy" es el del reloj, no el
// del servidor: a las 23:30 en Barcelona un reloj en Tenerife sigue en el día
// anterior. Por eso `date` es obligatoria y la manda el dispositivo.
//
// POR QUÉ TRES RESPUESTAS Y NO DOS
// --------------------------------
// `has_session` y `exportable` son distintas a propósito, y la app pinta una
// pantalla para cada una (mockup §8 y §9):
//   · sin sesión           → "Hoy no toca"
//   · sesión no de carrera → "Esto va en la app: el reloj no sabe guiar esto"
// Colapsarlas le diría al atleta que no entrena un día que sí entrena, o le
// dejaría descubrirlo con un 409 después de intentar la descarga.
//
//   200 siempre que el token valga — el "no hay nada" es un estado, no un error
//   401 unauthorized  — sin bearer de atleta válido
//   400 bad_request   — falta `date` o no es YYYY-MM-DD
//
// El `fit_url` apunta al endpoint que YA existe y ya está probado
// (`/api/athlete/wearables/garmin/workout`), no a una copia. Aquí no se
// re-encoda nada: esto es una vista, no un segundo camino al mismo fichero.

import { z } from 'zod';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  findWatchSessionForDate,
  loadRunWatchWorkout,
} from '@/lib/wearables/watch-workout-source';
import type { WatchWorkout } from '@fahybrid/shared/domain/wearables/watch-workout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
});

// Una línea para la pantalla del reloj. No re-deriva ritmos: los tramos ya traen
// su etiqueta resuelta desde el modelo neutro, así que aquí solo se cuenta el
// trabajo y se suma la distancia. Si algún tramo va por tiempo, no se inventa un
// total en kilómetros — se dice en minutos.
function summarize(workout: WatchWorkout): string {
  let workSteps = 0;
  let meters = 0;
  let seconds = 0;
  let hasOpen = false;

  for (const block of workout.blocks) {
    for (const step of block.steps) {
      if (step.kind === 'work') workSteps += block.iterations;
      if (step.measure.type === 'distance') meters += step.measure.m * block.iterations;
      else if (step.measure.type === 'duration') seconds += step.measure.s * block.iterations;
      else hasOpen = true;
    }
  }

  const parts: string[] = [];
  if (workSteps > 0) parts.push(workSteps === 1 ? '1 tramo' : `${workSteps} tramos`);
  if (meters > 0) parts.push(`${(meters / 1000).toFixed(1).replace('.', ',')} km`);
  else if (seconds > 0) parts.push(`${Math.round(seconds / 60)} min`);
  else if (hasOpen) parts.push('a sensaciones');

  return parts.join(' · ');
}

export async function GET(request: Request): Promise<Response> {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ date: url.searchParams.get('date') ?? '' });
  if (!parsed.success) {
    return jsonError('bad_request', parsed.error.issues[0]?.message ?? 'date required', 400);
  }

  const found = await findWatchSessionForDate(auth.athlete_id, parsed.data.date);

  if (found.kind === 'none') {
    return jsonOk({ has_session: false, exportable: false, reason: null });
  }
  if (found.kind === 'not_watchable') {
    return jsonOk({ has_session: true, exportable: false, reason: 'not_a_run_session' });
  }

  // Hay sesión de carrera. Se resuelve entera porque el nombre que devolvemos
  // tiene que ser EXACTAMENTE el que el .FIT lleva dentro: es lo único que la
  // app puede leer de vuelta del reloj (`getName()`) para saber que el entreno
  // que encontró es el suyo. Si lo adivináramos desde el título de la sesión, un
  // recorte distinto rompería el emparejamiento en silencio.
  const result = await loadRunWatchWorkout({
    athlete_id: auth.athlete_id,
    user_id: auth.user_id,
    assignment_id: BigInt(found.assignment_id),
  });

  if (!result.ok) {
    return jsonOk({ has_session: true, exportable: false, reason: result.reason });
  }

  const fit_url = new URL(
    `/api/athlete/wearables/garmin/workout?assignment_id=${result.assignment_id}`,
    url.origin,
  ).toString();

  return jsonOk({
    has_session: true,
    exportable: true,
    reason: null,
    workout_name: result.workout.name,
    summary: summarize(result.workout),
    fit_url,
  });
}
