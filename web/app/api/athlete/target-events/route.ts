// Athlete target events.
//
// GET  /api/athlete/target-events   — athlete's A/B/C-priority races
// POST /api/athlete/target-events   — mark / re-mark an event with a priority
//
// Auth: Bearer (athlete session). Coaches use the deep-dive page to view
// their athletes' targets, not this endpoint.

import { NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import {
  EventsError,
  listAthleteTargets,
  upsertAthleteTarget,
} from '@/lib/coach/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const athlete = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!athlete) return jsonError('unauthorized', 'Athlete bearer required', 401);

  try {
    const targets = await listAthleteTargets({ athlete_id: athlete.athlete_id });
    return jsonOk({ targets });
  } catch (err) {
    console.error('[GET /api/athlete/target-events]', err);
    return jsonError('list_failed', 'No se pudieron cargar tus eventos objetivo.', 500);
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const athlete = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!athlete) return jsonError('unauthorized', 'Athlete bearer required', 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json', 'Body must be valid JSON', 400);
  }

  try {
    const target = await upsertAthleteTarget({
      athlete_id: athlete.athlete_id,
      input: body,
    });
    return jsonOk({ target });
  } catch (err) {
    if (err instanceof EventsError) {
      return jsonError(err.code, err.message, err.status);
    }
    console.error('[POST /api/athlete/target-events]', err);
    return jsonError('upsert_failed', 'No se pudo guardar el evento objetivo.', 500);
  }
}
