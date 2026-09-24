// GET / PUT /api/coach/signal-thresholds
//
// Los umbrales de señal y las bandas de readiness que edita el coach (su método:
// HARD RULE Nº0). GET devuelve los EFECTIVOS en plano, cuáles son suyos
// (`custom_keys`) y los defectos del sistema. PUT escribe SOLO las claves que
// recibe — número nuevo o `null` para volver al defecto — y rechaza con 422 si el
// resultado es incoherente (p. ej. la banda de cautela por encima de la de
// «bien»). Zod en servidor con los límites de `COACH_THRESHOLD_SPEC`. Sesión de
// coach obligatoria y todo scoped a `session.coach_id`.

import type { NextResponse } from 'next/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk, type ApiError } from '@/lib/api/responses';
import {
  coachSignalThresholdsPutSchema,
  type CoachSignalThresholdsResponse,
} from '@fahybrid/shared/schema/coach-signal-thresholds';
import { thresholdIssues } from '@fahybrid/shared/domain/coach/signal-thresholds';
import {
  getCoachSignalThresholds,
  previewCoachThresholds,
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

  const next = await previewCoachThresholds(session.coach_id, parsedBody.data);
  const issues = thresholdIssues(next);
  if (issues.length > 0) {
    return jsonError('validation_error', issues[0]!.message, 422, { issues });
  }

  const thresholds = await upsertCoachSignalThresholds(session.coach_id, parsedBody.data);
  return jsonOk(thresholds);
}
