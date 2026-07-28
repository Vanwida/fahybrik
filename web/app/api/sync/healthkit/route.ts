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
import { recomputeAthlete } from '@/lib/coach/attention/recompute';
import { refreshAthleteReadinessDays } from '@/lib/coach/athlete-daily-readiness';

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

    // Persist the device's IANA timezone so readiness windows the day in the
    // athlete's own zone. Validated by the batch schema; only written when the
    // device reported one and it actually changed (travel keeps it fresh).
    if (parsed.data.batch.timezone) {
      await sql`
        update athletes
          set timezone = ${parsed.data.batch.timezone}, updated_at = now()
        where id = ${auth.athlete_id as unknown as number}
          and timezone is distinct from ${parsed.data.batch.timezone}
      `;
    }

    // The batch may carry last night's sleep / HRV / resting HR — recompute the
    // readiness snapshots it touches BEFORE responding (awaited: cheap, and a
    // fire-and-forget can be frozen with the function). Runs after the timezone
    // upsert above so the overnight windows use the fresh zone. Passing the
    // sample instants (not just "today") is what lets a resting-HR reading that
    // Apple publishes hours late still land on the day it belongs to — a day's
    // snapshot is otherwise only ever recomputed while it IS today.
    await refreshAthleteReadinessDays({
      athlete_id: auth.athlete_id,
      sample_times: parsed.data.batch.samples.map((s) => new Date(s.recorded_at)),
    });

    // Fire-and-forget: fresh biometrics can clear no_sync / move HRV signals
    // (and the attention sweep now reads the just-refreshed snapshot).
    void recomputeAthlete({ athlete_id: auth.athlete_id }).catch(() => {});

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
