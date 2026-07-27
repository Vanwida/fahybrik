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
import { recomputeAthlete } from '@/lib/coach/attention/recompute';
import { refreshAthleteReadinessToday } from '@/lib/coach/athlete-daily-readiness';
import { captureRouteError } from '@/lib/observability/capture';

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
    // The iOS client silently drops deterministic 4xx (a poison request would
    // replay forever), so a validation reject here is INVISIBLE on the device —
    // the athlete's check-in just never exists server-side. Leave a trace with
    // the field-level issues (messages only, no submitted values) so a drifted
    // client schema is caught from logs, not from a coach noticing missing data.
    captureRouteError(new Error('checkin body failed validation'), {
      route: 'api/checkins.POST',
      meta: { field_errors: parsed.error.flatten().fieldErrors },
    });
    return jsonError('invalid_request', 'Invalid check-in', 400, parsed.error.flatten());
  }

  const result = await ingestCheckin({
    sql,
    athlete_id: auth.athlete_id,
    snapshot: parsed.data.checkin,
  });

  // The check-in's sub_score is a 0.35-weight readiness component — fold it into
  // TODAY's snapshot before responding (awaited: cheap, and a fire-and-forget
  // can be frozen with the function).
  await refreshAthleteReadinessToday({ athlete_id: auth.athlete_id });

  // Fire-and-forget: a fresh check-in can clear checkin_skipped / move readiness
  // (the attention sweep reads the just-refreshed snapshot).
  void recomputeAthlete({ athlete_id: auth.athlete_id }).catch(() => {});

  return jsonOk({ ok: true, result });
}
