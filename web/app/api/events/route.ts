// GET /api/events
//
// Lists events. The athlete bearer is evaluated BEFORE the coach cookie. Returns:
//   - For athletes (bearer auth): only events flagged is_visible_to_athletes
//   - For coaches (cookie session): the shared catalog + the club's own events
//   - For unauthenticated callers: only visible events (treated as athlete view)
//
// Query params:
//   type      = 'hyrox' | 'crossfit' | 'other'
//   region    = 'EU' | 'NA' | 'APAC' | 'LATAM' | 'MEA'
//   scope     = 'upcoming' (default) | 'past' | 'all'
//   from_date = YYYY-MM-DD
//   to_date   = YYYY-MM-DD
//
// Response shape: { events: EventListItem[], scope, role: 'coach' | 'athlete' }

import { NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getCoachSession } from '@/lib/auth/coach-session';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { listEvents, type ListEventsOpts } from '@/lib/coach/events';
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
  if (!raw) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  return raw;
}

function parseRegion(raw: string | null): EventRegion | undefined {
  if (!raw) return undefined;
  const r = eventRegion.safeParse(raw);
  return r.success ? r.data : undefined;
}

function parseType(raw: string | null): 'hyrox' | 'crossfit' | 'other' | undefined {
  if (!raw) return undefined;
  const r = eventType.safeParse(raw);
  return r.success ? r.data : undefined;
}

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);

  // Bearer FIRST (same precedence as resolveChatPrincipal): a request carrying an
  // athlete token is the athlete view, full stop — a coach cookie riding the same
  // request must never widen it to the unfiltered coach catalog.
  const athlete = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  const coach = athlete ? null : await getCoachSession();
  const role: 'coach' | 'athlete' = coach ? 'coach' : 'athlete';

  const opts: ListEventsOpts = {
    type: parseType(url.searchParams.get('type')),
    region: parseRegion(url.searchParams.get('region')),
    scope: parseScope(url.searchParams.get('scope')),
    from_date: parseDate(url.searchParams.get('from_date')),
    to_date: parseDate(url.searchParams.get('to_date')),
    visibility: coach ? 'all' : 'visible',
    // Coach view: shared catalog + THIS club's own events, never another club's.
    coach_id: coach?.coach_id,
  };

  try {
    const events = await listEvents(opts);
    // Athletes don't need the visibility flag in their payload (it's
    // always true for events they see) — strip it to avoid confusion.
    if (!coach) {
      return jsonOk({
        events: events.map((e) => {
          const { is_visible_to_athletes: _drop, ...rest } = e;
          return rest;
        }),
        scope: opts.scope,
        role,
        athlete_id: athlete ? String(athlete.athlete_id) : null,
      });
    }
    return jsonOk({ events, scope: opts.scope, role });
  } catch (err) {
    console.error('[GET /api/events]', err);
    return jsonError('list_failed', 'No se pudieron cargar los eventos.', 500);
  }
}
