// Shared route handler for the daily-checkin POST. Mounted at two paths:
//   * /api/checkins        — what the iOS client already ships with
//   * /api/sync/checkins   — task #31 spec naming (alias)
//
// Both URLs accept the same wrapper { checkin: CheckinSnapshot } body and
// produce the same response.

import { NextResponse } from 'next/server';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { ingestCheckin } from './checkin';
import { checkinRequestSchema } from './schema';

export async function handleCheckinPost(req: Request): Promise<NextResponse> {
  const auth = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!auth) {
    return jsonError('unauthorized', 'Athlete bearer token required', 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json', 'Request body must be JSON', 400);
  }

  const parsed = checkinRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Invalid check-in', 400, parsed.error.flatten());
  }

  const result = await ingestCheckin({
    sql,
    athlete_id: auth.athlete_id,
    snapshot: parsed.data.checkin,
  });

  return jsonOk({ ok: true, result });
}
