// POST /api/athlete/race-results/import
//
// The athlete pastes an official HYROX detail link; we fetch + parse it and
// store the full official result (splits, ranks, percentile) on the athlete's
// `races` row. Idempotent per (athlete, HYROX idp) — re-pasting refreshes.
//
// Auth: Bearer (athlete session). snake_case responses. Strict Zod validation.
// SECURITY: the result_url host is validated to be exactly results.hyrox.com
// (SSRF allowlist) inside parseHyroxUrl before any fetch is issued.

import type { NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { HyroxParseError } from '@/lib/hyrox/parse';
import { importHyroxResult } from '@/lib/hyrox/import';
import { hyroxImportInput } from '@fahybrid/shared/schema';

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

  const parsed = hyroxImportInput.safeParse(raw);
  if (!parsed.success) {
    return jsonError('invalid_body', 'Validation failed', 400, parsed.error.flatten());
  }

  try {
    const result = await importHyroxResult({
      athlete_id: athlete.athlete_id,
      result_url: parsed.data.result_url,
    });
    return jsonOk({ result }, 201);
  } catch (err) {
    if (err instanceof HyroxParseError) {
      // 422 for "we reached HYROX but couldn't parse it"; 400 for bad input.
      const status = err.code === 'invalid_url' || err.code === 'invalid_host' ? 400 : 422;
      return jsonError(err.code, err.message, status);
    }
    console.error('[POST /api/athlete/race-results/import]', err);
    return jsonError('import_failed', 'No se pudo importar el resultado.', 500);
  }
}
