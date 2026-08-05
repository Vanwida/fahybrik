// GET / PUT /api/coach/import-defaults
//
// The coach's editable defaults for the photo importer: rest between sets
// (per modality), the RIR a strength set assumes with no stated intensity,
// and the rep-count floor/ceiling used when a cell shows sets but no number.
// GET resolves the coach's own row, or the system defaults when they haven't
// authored one (is_custom flags which). PUT replaces the whole set of six
// values (server-side Zod: bounded rest seconds, RIR, rep range with
// min<=max). Coach session required; scoped to session.coach_id. Mirrors
// web/app/api/coach/guidance/[context]/route.ts.

import type { NextResponse } from 'next/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk, type ApiError } from '@/lib/api/responses';
import {
  importDefaultsPutSchema,
  type ImportDefaultsResponse,
} from '@fahybrid/shared/schema/coach-import-defaults';
import { getImportDefaults, upsertImportDefaults } from '@/lib/coach/import-defaults';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse<ImportDefaultsResponse | ApiError>> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const defaults = await getImportDefaults(session.coach_id);
  return jsonOk(defaults);
}

export async function PUT(
  request: Request,
): Promise<NextResponse<ImportDefaultsResponse | ApiError>> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }
  const parsedBody = importDefaultsPutSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsedBody.error.flatten());
  }

  const defaults = await upsertImportDefaults(session.coach_id, parsedBody.data);
  return jsonOk(defaults);
}
