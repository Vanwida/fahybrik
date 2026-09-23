// Coach events admin API.
//
// GET  /api/coach/events       — the coach's full event list (incl. invisible)
// POST /api/coach/events       — the coach creates a manual event
//
// An empty list is an empty list: nothing is invented to fill it (the old demo
// fallback showed made-up races to a real coach — DECISIONS 2026-09-23).

import { NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getCoachSession } from '@/lib/auth/coach-session';
import {
  EventsError,
  createEvent,
  listEvents,
  type ListEventsOpts,
} from '@/lib/coach/events';
import {
  eventRegion,
  type EventRegion,
} from '@fahybrid/shared/schema/events';
import { eventType } from '@fahybrid/shared/schema/_primitives';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseScope(raw: string | null): ListEventsOpts['scope'] {
  if (raw === 'past' || raw === 'all') return raw;
  return 'upcoming';
}
function parseDate(raw: string | null): string | undefined {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  return raw;
}
function parseRegion(raw: string | null): EventRegion | undefined {
  if (!raw) return undefined;
  const r = eventRegion.safeParse(raw);
  return r.success ? r.data : undefined;
}
function parseType(raw: string | null): 'hyrox' | 'crossfit' | 'running' | 'ocr' | 'other' | undefined {
  if (!raw) return undefined;
  const r = eventType.safeParse(raw);
  return r.success ? r.data : undefined;
}

export async function GET(req: Request): Promise<NextResponse> {
  const coach = await getCoachSession();
  if (!coach) return jsonError('unauthorized', 'Coach session required', 401);

  const url = new URL(req.url);
  const opts: ListEventsOpts = {
    type: parseType(url.searchParams.get('type')),
    region: parseRegion(url.searchParams.get('region')),
    scope: parseScope(url.searchParams.get('scope')),
    from_date: parseDate(url.searchParams.get('from_date')),
    to_date: parseDate(url.searchParams.get('to_date')),
    visibility: 'all',
    // Catalog + THIS club's manual events — never another club's.
    coach_id: coach.coach_id,
  };

  try {
    const events = await listEvents(opts);
    return jsonOk({ events, scope: opts.scope });
  } catch (err) {
    console.error('[GET /api/coach/events]', err);
    return jsonError('list_failed', 'No se pudieron cargar los eventos.', 500);
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const coach = await getCoachSession();
  if (!coach) return jsonError('unauthorized', 'Coach session required', 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json', 'Body must be valid JSON', 400);
  }

  try {
    const event = await createEvent({ coach_id: coach.coach_id, input: body });
    return jsonOk({ event }, 201);
  } catch (err) {
    if (err instanceof EventsError) {
      return jsonError(err.code, err.message, err.status);
    }
    console.error('[POST /api/coach/events]', err);
    return jsonError('create_failed', 'No se pudo crear el evento.', 500);
  }
}
