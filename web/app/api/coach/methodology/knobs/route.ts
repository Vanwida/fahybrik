// GET / PUT /api/coach/methodology/knobs
//
// Los 5 mandos de metodología del coach (spec docs/metodologia-coach.html):
// zonas, tests por defecto, fin de bloque, cuándo bajar el día, tono.
// GET resuelve la fila del coach, o los defectos de mecanismo cuando no ha
// escrito ninguna (`is_custom` dice cuál). PUT reemplaza el conjunto entero
// (Zod en servidor). Sesión de coach obligatoria y todo scoped a
// `session.coach_id`. Sin fila = defaults neutros, no la escuela de otro club.
// Espejo de app/api/coach/import-defaults/route.ts.

import type { NextResponse } from 'next/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk, type ApiError } from '@/lib/api/responses';
import {
  coachMethodologyKnobsPutSchema,
  type CoachMethodologyKnobsResponse,
} from '@fahybrid/shared/schema/coach-methodology-knobs';
import {
  getCoachMethodologyKnobs,
  upsertCoachMethodologyKnobs,
} from '@/lib/coach/methodology-knobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse<CoachMethodologyKnobsResponse | ApiError>> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const knobs = await getCoachMethodologyKnobs(session.coach_id);
  return jsonOk(knobs);
}

export async function PUT(
  request: Request,
): Promise<NextResponse<CoachMethodologyKnobsResponse | ApiError>> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }
  const parsedBody = coachMethodologyKnobsPutSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsedBody.error.flatten());
  }

  const knobs = await upsertCoachMethodologyKnobs(session.coach_id, parsedBody.data);
  return jsonOk(knobs);
}
