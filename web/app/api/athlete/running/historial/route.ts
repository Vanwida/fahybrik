import { z } from 'zod';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { buildRunningHistorial, HISTORIAL_WINDOWS } from '@/lib/athlete/running/historial';
import { RUN_SESSION_TYPES } from '@fahybrid/shared/domain/running/session-type';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/athlete/running/historial?window=7d|30d|365d|all&tipo=<slug>|all
//
// El historial de carrera del atleta (mapa v2, sección Historial, obra
// carrera-hub-ios): agregados del periodo + filas por semana, con las
// importadas dentro. Ver web/lib/athlete/running/historial.ts para el
// contrato completo y por qué `veredicto` sale siempre null.
const windowSchema = z.enum(HISTORIAL_WINDOWS);
const tipoSchema = z.enum([...RUN_SESSION_TYPES, 'all'] as [string, ...string[]]);

export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const url = new URL(request.url);
  const windowParsed = windowSchema.safeParse(url.searchParams.get('window') ?? '30d');
  if (!windowParsed.success) {
    return jsonError('bad_request', `window debe ser uno de: ${HISTORIAL_WINDOWS.join(', ')}`, 400);
  }
  const tipoParsed = tipoSchema.safeParse(url.searchParams.get('tipo') ?? 'all');
  if (!tipoParsed.success) {
    return jsonError('bad_request', `tipo debe ser uno de: ${[...RUN_SESSION_TYPES, 'all'].join(', ')}`, 400);
  }

  const historial = await buildRunningHistorial({
    athlete_id: Number(auth.athlete_id),
    window: windowParsed.data,
    tipo: tipoParsed.data as (typeof RUN_SESSION_TYPES)[number] | 'all',
  });
  return jsonOk(historial);
}
