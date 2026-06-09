// GET /api/athlete/nutrition/barcode?code=XXXX — Open Food Facts proxy.
//
// Returns per-100g macros for the client to prefill an entry form. Persists
// NOTHING — the client POSTs the (possibly edited) entry afterwards. Graceful:
// OFF miss or outage → { found:false }, never a 500.

import type { NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { barcodeQuerySchema } from '@/lib/nutrition/schema';
import { lookupBarcode } from '@/lib/nutrition/openfoodfacts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const athlete = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!athlete) return jsonError('unauthorized', 'Athlete bearer required', 401);

  const code = new URL(req.url).searchParams.get('code');
  const parsed = barcodeQuerySchema.safeParse({ code });
  if (!parsed.success) {
    return jsonError('invalid_query', 'code must be 6-14 digits', 400);
  }

  const result = await lookupBarcode(parsed.data.code);
  return jsonOk(result);
}
