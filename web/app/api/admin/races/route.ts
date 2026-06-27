// Admin race-catalog curation API (phase 2c) — owner/admin only.
//
//   GET  /api/admin/races   — full catalog (past + future, visible + hidden)
//   POST /api/admin/races   — create a race manually (HYROX gaps etc.)
//
// Reuses the shared events service (lib/coach/events). Pablo (coach) and
// athletes never reach this surface — requireAdmin() returns 404 for them so the
// admin API is not even disclosed. The owner is the only curator: a manual
// create is marked verified (scraper-safe) and visible by default.

import { NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireAdmin } from '@/lib/auth/require-admin';
import { EventsError, createEvent, listEvents } from '@/lib/coach/events';
import { adminRaceCreateInput } from '@fahybrid/shared/schema/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    // The curator sees EVERYTHING — past races, hidden rows, tentative imports.
    const races = await listEvents({ scope: 'all', visibility: 'all' });
    return jsonOk({ races });
  } catch (err) {
    console.error('[GET /api/admin/races]', err);
    return jsonError('list_failed', 'No se pudo cargar el catálogo de carreras.', 500);
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json', 'Body must be valid JSON', 400);
  }

  const parsed = adminRaceCreateInput.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      'invalid_request',
      'Revisa los campos de la carrera.',
      400,
      parsed.error.flatten(),
    );
  }
  const { verified, ...eventInput } = parsed.data;

  try {
    const event = await createEvent({
      // Admin-curated catalog rows have no coach; the curator is recorded via
      // verified_by_user_id. A manual create is verified unless explicitly not.
      coach_id: null,
      verified_by_user_id: verified === false ? null : auth.session.user_id,
      input: { ...eventInput, source: eventInput.source ?? 'manual' },
    });
    return jsonOk({ race: event }, 201);
  } catch (err) {
    if (err instanceof EventsError) {
      return jsonError(err.code, err.message, err.status);
    }
    console.error('[POST /api/admin/races]', err);
    return jsonError('create_failed', 'No se pudo crear la carrera.', 500);
  }
}
