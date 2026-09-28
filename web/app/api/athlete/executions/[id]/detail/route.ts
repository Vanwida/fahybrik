// GET /api/athlete/executions/[id]/detail
//
// El detalle de un entreno HECHO, abierto por su ejecución — el que necesita el
// historial para lo que no tiene asignación (importaciones de Apple Salud, entrenos
// guardados «fuera del plan»). Misma respuesta que
// `/api/athlete/assignments/[id]/detail` (con `assignment: null` cuando no hay
// asignación) — ver lib/athlete/execution-detail.ts.
//
// Auth: bearer del atleta. La propiedad va en el WHERE: una ejecución ajena o
// inexistente es 404, sin filtrar cuál de las dos.

import { z } from 'zod';
import { NextResponse } from 'next/server';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { loadExecutionDetail } from '@/lib/athlete/execution-detail';
import { resolveAthleteRunningThresholds } from '@/lib/coach/running-thresholds';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idParamSchema = z.string().regex(/^\d+$/).transform((v) => BigInt(v));

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!auth) {
    return jsonError('unauthorized', 'Athlete bearer token required', 401);
  }

  const { id } = await ctx.params;
  const parsed = idParamSchema.safeParse(id);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Invalid execution id', 400);
  }

  const thresholds = await resolveAthleteRunningThresholds(auth.athlete_id, sql);
  const detail = await loadExecutionDetail({
    sql,
    athlete_id: auth.athlete_id,
    execution_id: parsed.data,
    self_user_id: auth.user_id,
    gradient_retires_pace_pct: thresholds.gradient_retires_pace_pct,
  });

  if (!detail) {
    return jsonError('not_found', 'Execution not found', 404);
  }
  return jsonOk(detail);
}
