// GET / PUT /api/coach/guidance/[context]
//
// The coach's editable "consejos" for a doubles context (race_doubles |
// sim_doubles). GET resolves the coach's own list, or the system defaults when
// they haven't authored any (is_custom flags which). PUT replaces the whole
// ordered list (server-side Zod: 1..8 tips, each 1..200 chars after trim,
// non-empty). Coach session required; scoped to session.coach_id.

import type { NextResponse } from 'next/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk, type ApiError } from '@/lib/api/responses';
import {
  coachGuidanceContextSchema,
  coachGuidancePutSchema,
  type CoachGuidanceResponse,
} from '@fahybrid/shared/schema/coach-guidance';
import { getCoachGuidance, upsertCoachGuidance } from '@/lib/coach/guidance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ context: string }> };

export async function GET(
  _request: Request,
  ctx: Ctx,
): Promise<NextResponse<CoachGuidanceResponse | ApiError>> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const parsed = coachGuidanceContextSchema.safeParse((await ctx.params).context);
  if (!parsed.success) return jsonError('bad_request', 'Contexto inválido', 400);

  const guidance = await getCoachGuidance(session.coach_id, parsed.data);
  return jsonOk(guidance);
}

export async function PUT(
  request: Request,
  ctx: Ctx,
): Promise<NextResponse<CoachGuidanceResponse | ApiError>> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const parsedContext = coachGuidanceContextSchema.safeParse((await ctx.params).context);
  if (!parsedContext.success) return jsonError('bad_request', 'Contexto inválido', 400);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }
  const parsedBody = coachGuidancePutSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsedBody.error.flatten());
  }

  const guidance = await upsertCoachGuidance(
    session.coach_id,
    parsedContext.data,
    parsedBody.data.items,
  );
  return jsonOk(guidance);
}
