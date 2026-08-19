// GET / PUT /api/coach/method-interview
//
// Entrevista «Cómo entrenas». GET sirve la fila del coach o el vacío
// (la IA no imita). PUT reemplaza casillas + espejo (Zod en servidor).
// Sesión Clerk. Scope: session.coach_id.

import type { NextResponse } from 'next/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk, type ApiError } from '@/lib/api/responses';
import {
  coachMethodInterviewPutSchema,
  type CoachMethodInterviewResponse,
} from '@fahybrid/shared/schema/coach-method-interview';
import { normalizeAnswers } from '@fahybrid/shared/domain/coach/method-interview';
import {
  getCoachMethodInterview,
  upsertCoachMethodInterview,
} from '@/lib/coach/method-interview';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse<CoachMethodInterviewResponse | ApiError>> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const interview = await getCoachMethodInterview(session.coach_id);
  return jsonOk(interview);
}

export async function PUT(
  request: Request,
): Promise<NextResponse<CoachMethodInterviewResponse | ApiError>> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }
  const parsedBody = coachMethodInterviewPutSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsedBody.error.flatten());
  }

  const interview = await upsertCoachMethodInterview(session.coach_id, {
    answers: normalizeAnswers(parsedBody.data.answers),
    ...(parsedBody.data.mirror_text !== undefined
      ? { mirror_text: parsedBody.data.mirror_text }
      : {}),
  });
  return jsonOk(interview);
}
