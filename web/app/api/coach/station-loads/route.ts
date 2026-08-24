// GET / PUT /api/coach/station-loads
//
// Tabla editable de kilos (o damper) de competición por estación, división y
// género. Método del coach. GET sirve la rejilla completa: vacío = no lo sé.
// PUT reemplaza el conjunto entero. Sin seed. Sin kilos inventados.
// Sesión de coach obligatoria, scoped a `session.coach_id`.

import type { NextResponse } from 'next/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk, type ApiError } from '@/lib/api/responses';
import {
  coachStationLoadsPutSchema,
  type CoachStationLoadsResponse,
} from '@fahybrid/shared/schema/coach-station-loads';
import { getCoachStationLoads, upsertCoachStationLoads } from '@/lib/coach/station-loads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse<CoachStationLoadsResponse | ApiError>> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const loads = await getCoachStationLoads(session.coach_id);
  return jsonOk(loads);
}

export async function PUT(
  request: Request,
): Promise<NextResponse<CoachStationLoadsResponse | ApiError>> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }
  const parsedBody = coachStationLoadsPutSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsedBody.error.flatten());
  }

  const loads = await upsertCoachStationLoads(session.coach_id, parsedBody.data);
  return jsonOk(loads);
}
