// GET / PUT /api/coach/phrase-dictionary
//
// Frase de carga del coach → un objetivo ya existente. Método suyo. Vacío =
// no lo sé. El importador no inventa el mapeo. Sesión de coach, scoped a
// `session.coach_id`.

import type { NextResponse } from 'next/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk, type ApiError } from '@/lib/api/responses';
import {
  coachPhraseDictionaryPutSchema,
  type CoachPhraseDictionaryResponse,
} from '@fahybrid/shared/schema/coach-phrase-dictionary';
import {
  getCoachPhraseDictionary,
  upsertCoachPhraseDictionary,
} from '@/lib/coach/phrase-dictionary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse<CoachPhraseDictionaryResponse | ApiError>> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const dict = await getCoachPhraseDictionary(session.coach_id);
  return jsonOk(dict);
}

export async function PUT(
  request: Request,
): Promise<NextResponse<CoachPhraseDictionaryResponse | ApiError>> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }
  const parsedBody = coachPhraseDictionaryPutSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsedBody.error.flatten());
  }

  const dict = await upsertCoachPhraseDictionary(session.coach_id, parsedBody.data);
  return jsonOk(dict);
}
