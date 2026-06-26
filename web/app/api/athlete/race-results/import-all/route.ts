// POST /api/athlete/race-results/import-all
//
// Import an athlete's FULL HYROX history (singles + doubles/relay) from
// hyresult.com by slug (the candidate the athlete picked from /search). Each
// race upserts idempotently into `races` (dedup on athlete_id+source_idp) and
// its teammates into `race_partners`. Re-running refreshes in place.
//
// Auth: Bearer (athlete session). snake_case responses. Strict Zod validation.
// The slug is charset-restricted (Zod) before it ever reaches the profile URL.

import type { NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { HyresultError, importAllRaces } from '@/lib/hyrox/hyresult';
import { hyresultImportAllInput } from '@fahybrid/shared/schema';

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

  const parsed = hyresultImportAllInput.safeParse(raw);
  if (!parsed.success) {
    return jsonError('invalid_body', 'Validation failed', 400, parsed.error.flatten());
  }

  try {
    const result = await importAllRaces({
      athlete_id: athlete.athlete_id,
      slug: parsed.data.slug,
    });
    return jsonOk(result, 201);
  } catch (err) {
    if (err instanceof HyresultError) {
      // 404 = the athlete slug has no hyresult profile (not found); 422 = we
      // fetched but couldn't parse the history; 502 = upstream fetch failed
      // (couldn't reach hyresult).
      const status =
        err.code === 'not_found' ? 404 : err.code === 'parse_failed' ? 422 : 502;
      return jsonError(err.code, err.message, status);
    }
    console.error('[POST /api/athlete/race-results/import-all]', err);
    return jsonError('import_failed', 'No se pudo importar el historial.', 500);
  }
}
