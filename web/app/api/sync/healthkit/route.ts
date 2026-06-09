// POST /api/sync/healthkit
//
// Receives batches of HKWorkoutDTO + HKBiometricSampleDTO from the iOS
// HealthKitSyncService (or its RequestQueue replay). Auth: Bearer athlete
// session — every request is scoped to the calling athlete.
//
// Body shape: { batch: HKSyncBatch } — see lib/sync/schema.ts for the
// full Zod definition. Workouts deduplicate on
// (athlete_id, source='healthkit', source_workout_id, started_at±5min);
// samples deduplicate on (athlete_id, source, metric_type, recorded_at,
// value_numeric).

import { NextResponse } from 'next/server';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { ingestHealthkitBatch } from '@/lib/sync/ingest-healthkit';
import { healthkitSyncRequestSchema } from '@/lib/sync/schema';
import { captureRouteError } from '@/lib/observability/capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
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

  const parsed = healthkitSyncRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Invalid sync batch', 400, parsed.error.flatten());
  }

  try {
    const result = await ingestHealthkitBatch({
      sql,
      athlete_id: auth.athlete_id,
      batch: parsed.data.batch,
    });

    // Update the per-athlete last_sync_at marker so coach UI can show
    // "last synced 2m ago".
    await sql`
      insert into healthkit_sync_state (athlete_id, last_sync_at, updated_at)
      values (${auth.athlete_id as unknown as number}, now(), now())
      on conflict (athlete_id) do update
        set last_sync_at = now(), updated_at = now()
    `;

    return jsonOk({ ok: true, result });
  } catch (err) {
    captureRouteError(err, {
      route: 'api/sync/healthkit.POST',
      meta: {
        athlete_id: String(auth.athlete_id),
        workouts: parsed.data.batch.workouts?.length ?? 0,
        samples: parsed.data.batch.samples?.length ?? 0,
      },
    });
    return jsonError('internal', 'HealthKit ingest failed', 500);
  }
}
