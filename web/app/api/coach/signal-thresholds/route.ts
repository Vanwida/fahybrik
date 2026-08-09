// GET / PUT /api/coach/signal-thresholds
//
// Los umbrales de señal que edita el coach: cuántos días aguanta una pregunta
// sin respuesta antes de subir a /hoy, a partir de qué retraso una tarea vencida
// pasa a crítica, y con cuánta antelación reclama un protocolo sin abrir. GET
// resuelve la fila del coach, o los defectos del sistema cuando no ha escrito
// ninguna (`is_custom` dice cuál de las dos). PUT reemplaza el conjunto entero
// (Zod en servidor: enteros dentro de los límites). Sesión de coach obligatoria
// y todo scoped a `session.coach_id`. Espejo de app/api/coach/import-defaults/route.ts.

import type { NextResponse } from 'next/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk, type ApiError } from '@/lib/api/responses';
import {
  coachSignalThresholdsPutSchema,
  type CoachSignalThresholdsResponse,
} from '@fahybrid/shared/schema/coach-signal-thresholds';
import {
  getCoachSignalThresholds,
  upsertCoachSignalThresholds,
} from '@/lib/coach/signal-thresholds';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse<CoachSignalThresholdsResponse | ApiError>> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const thresholds = await getCoachSignalThresholds(session.coach_id);
  return jsonOk(thresholds);
}

export async function PUT(
  request: Request,
): Promise<NextResponse<CoachSignalThresholdsResponse | ApiError>> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }
  const parsedBody = coachSignalThresholdsPutSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsedBody.error.flatten());
  }

  const thresholds = await upsertCoachSignalThresholds(session.coach_id, parsedBody.data);
  return jsonOk(thresholds);
}
