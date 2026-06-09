// GET /api/athlete/export-data
//
// RGPD Art. 15 (right of access) + Art. 20 (data portability) + Apple App
// Store Guideline 5.1.1(v) ("Account Deletion") implementation. Authed
// athlete fetches a structured JSON document with EVERY personal data point
// FAHYBRIK holds on them.
//
// Auth: athlete bearer (Sign in with Apple JWT). No body, no params.
// Response: application/json, Content-Disposition attachment so iOS treats
// it as a downloadable file.

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { exportAthleteData } from '@/lib/athlete/data-export';
import { captureRouteError } from '@/lib/observability/capture';
import { RATE_LIMITS, rateLimitResponse, withRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function bigintJsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  return value;
}

export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) {
    return jsonError('unauthorized', 'Athlete bearer token required', 401);
  }

  // A1: this is a heavy multi-query export — cap to a few per hour per athlete.
  const rl = await withRateLimit({
    scope: 'athlete',
    identifier: auth.athlete_id.toString(),
    ...RATE_LIMITS.exportData,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const data = await exportAthleteData({
      sql,
      athlete_id: auth.athlete_id,
    });

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const filename = `fahybrik-datos-${auth.athlete_id.toString()}-${today}.json`;
    const body = JSON.stringify(data, bigintJsonReplacer, 2);

    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        // Don't ever cache personal data downloads.
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    captureRouteError(err, {
      route: 'api/athlete/export-data.GET',
      meta: { athlete_id: String(auth.athlete_id) },
    });
    return jsonError('internal', 'Data export failed', 500);
  }
}
