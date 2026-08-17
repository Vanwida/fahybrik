// GET / PUT /api/coach/how-i-work
//
// Texto de cómo trabaja el coach. Scoped a session.coach_id. Vacío = no imitar.
// El PDF va por /api/coach/how-i-work/pdf.

import type { NextResponse } from 'next/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk, type ApiError } from '@/lib/api/responses';
import {
  coachHowIWorkPutSchema,
  type CoachHowIWorkResponse,
} from '@fahybrid/shared/schema/coach-how-i-work';
import { getHowIWork, upsertHowIWorkText } from '@/lib/coach/how-i-work';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse<CoachHowIWorkResponse | ApiError>> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const howIWork = await getHowIWork(session.coach_id);
  return jsonOk(howIWork);
}

export async function PUT(
  request: Request,
): Promise<NextResponse<CoachHowIWorkResponse | ApiError>> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }
  const parsed = coachHowIWorkPutSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsed.error.flatten());
  }

  const howIWork = await upsertHowIWorkText(session.coach_id, parsed.data.body_text);
  return jsonOk(howIWork);
}
