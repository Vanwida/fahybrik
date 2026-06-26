// GET /api/athlete/race-results/search?q=<name>
//
// Search hyresult.com athletes by name → candidate list the athlete picks from
// before importing their full history. Auth: Bearer (athlete session).
// snake_case responses. Strict Zod validation on the query.

import type { NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { HyresultError, searchAthletes } from '@/lib/hyrox/hyresult';
import { hyresultSearchInput } from '@fahybrid/shared/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const athlete = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!athlete) return jsonError('unauthorized', 'Athlete bearer required', 401);

  const url = new URL(req.url);
  const parsed = hyresultSearchInput.safeParse({ q: url.searchParams.get('q') ?? '' });
  if (!parsed.success) {
    return jsonError('invalid_query', 'Validation failed', 400, parsed.error.flatten());
  }

  try {
    const candidates = await searchAthletes(parsed.data.q);
    return jsonOk({ candidates });
  } catch (err) {
    if (err instanceof HyresultError) {
      // We reached our code but the upstream search was unavailable.
      return jsonError(err.code, err.message, 502);
    }
    console.error('[GET /api/athlete/race-results/search]', err);
    return jsonError('search_failed', 'No se pudo buscar.', 500);
  }
}
