// GET /api/athlete/nutrition/search?q=<texto> — Open Food Facts search proxy.
//
// Returns per-100g macros for the client to prefill an entry form (same as the
// barcode proxy, but matched by name). Persists NOTHING — the client POSTs the
// chosen + edited entry afterwards. Graceful: OFF miss or outage → { results:[] },
// never a 500.

import type { NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { searchQuerySchema } from '@/lib/nutrition/schema';
import { searchFoods } from '@/lib/nutrition/openfoodfacts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const athlete = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!athlete) return jsonError('unauthorized', 'Athlete bearer required', 401);

  const q = new URL(req.url).searchParams.get('q');
  const parsed = searchQuerySchema.safeParse({ q });
  if (!parsed.success) {
    return jsonError('invalid_query', 'q must be 2-100 chars', 400);
  }

  const result = await searchFoods(parsed.data.q);
  return jsonOk(result);
}
