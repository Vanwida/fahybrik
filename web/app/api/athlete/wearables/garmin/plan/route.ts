// GET /api/athlete/wearables/garmin/plan?from=YYYY-MM-DD&days=7   (bearer de atleta)
//
// El PLAN COMPACTO de cada sesión de los próximos días, para el motor propio del
// reloj Garmin (docs/garmin-reloj/servidor.md). Hermano de `garmin/today`, que
// describe el día para la app Connect IQ que carga un .FIT.
//
// `from` es la fecha LOCAL del reloj (el atleta puede estar en otro huso): el
// servidor no resuelve nada contra su propio «hoy». `days` va de 1 a 14 y la
// respuesta entera vive en la RAM del reloj, así que se piden pocos días.
//
//   200 { v, sesiones: [{ asignacion_id, fecha, huella, soportada, motivo?, plan? }] }
//       · `plan` es el binario compacto en base64; `asignacion_id` y `huella` van
//         TAMBIÉN fuera del blob para no bajar lo que el reloj ya tiene.
//       · `soportada:false` con `motivo` (`fase_2`, `sin_estructura`,
//         `demasiado_grande`, `no_codificable`): el reloj dice «Esta sesión va
//         en la app». Nunca una versión recortada.
//   401 unauthorized  — sin bearer de atleta válido
//   400 bad_request   — `from` ausente o mal formada, o `days` fuera de 1..14

import { z } from 'zod';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { loadGarminPlanSessions } from '@/lib/wearables/garmin-plan-source';
import { VERSION_ESQUEMA } from '@fahybrid/shared/domain/watch-plan/plan-compacto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIAS_MIN = 1;
const DIAS_MAX = 14;
const DIAS_DEFECTO = 7;

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD'),
  days: z.coerce.number().int().min(DIAS_MIN).max(DIAS_MAX).default(DIAS_DEFECTO),
});

export async function GET(request: Request): Promise<Response> {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const q = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({ from: q.get('from') ?? '', days: q.get('days') ?? undefined });
  if (!parsed.success) {
    return jsonError('bad_request', parsed.error.issues[0]?.message ?? 'from required', 400);
  }

  const sesiones = await loadGarminPlanSessions({
    athlete_id: auth.athlete_id,
    user_id: auth.user_id,
    from: parsed.data.from,
    days: parsed.data.days,
  });
  return jsonOk({ v: VERSION_ESQUEMA, sesiones });
}
