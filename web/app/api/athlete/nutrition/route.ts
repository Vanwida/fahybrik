// POST /api/athlete/nutrition       — create one food-log entry for the session athlete.
// GET  /api/athlete/nutrition?date= — list the athlete's entries + daily totals.
//
// Bearer auth (athlete session). snake_case responses. Strict Zod validation.

import type { NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { createNutritionEntry, listNutritionForDay } from '@/lib/nutrition/entries';
import { barcodeQuerySchema, createNutritionSchema, isoDate } from '@/lib/nutrition/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const athlete = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!athlete) return jsonError('unauthorized', 'Athlete bearer required', 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('invalid_body', 'Body must be valid JSON', 400);
  }

  const parsed = createNutritionSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('invalid_body', 'Validation failed', 400, parsed.error.flatten());
  }

  // If a barcode was supplied, validate it against the same digit rule used by
  // the proxy (the body schema already enforces 6-14 digits when present).
  if (parsed.data.barcode) {
    const ok = barcodeQuerySchema.safeParse({ code: parsed.data.barcode }).success;
    if (!ok) return jsonError('invalid_body', 'barcode must be 6-14 digits', 400);
  }

  try {
    const entry = await createNutritionEntry({
      athlete_id: athlete.athlete_id,
      input: parsed.data,
    });
    return jsonOk({ entry }, 201);
  } catch (err) {
    console.error('[POST /api/athlete/nutrition]', err);
    return jsonError('create_failed', 'No se pudo guardar la comida.', 500);
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const athlete = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!athlete) return jsonError('unauthorized', 'Athlete bearer required', 401);

  const dateParam = new URL(req.url).searchParams.get('date');
  const parsed = isoDate.safeParse(dateParam);
  if (!parsed.success) {
    return jsonError('invalid_query', 'date query param must be YYYY-MM-DD', 400);
  }

  try {
    const { entries, totals } = await listNutritionForDay({
      athlete_id: athlete.athlete_id,
      date: parsed.data,
    });
    return jsonOk({ date: parsed.data, entries, totals });
  } catch (err) {
    console.error('[GET /api/athlete/nutrition]', err);
    return jsonError('list_failed', 'No se pudo cargar la nutrición.', 500);
  }
}
