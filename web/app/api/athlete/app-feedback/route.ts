import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk, getClientIp } from '@/lib/api/responses';
import { withRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/security/rate-limit';
import { appFeedbackSchema, recordAppFeedback } from '@/lib/athlete/app-feedback';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/athlete/app-feedback — an athlete sends US (product) a bug report or
// a suggestion from inside the app. Bearer-authed; the row is persisted (source
// of truth) and the team is best-effort notified by email. NOT coach-facing.
export async function POST(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const rl = await withRateLimit({
    scope: 'user',
    endpoint: RATE_LIMITS.appFeedback.endpoint,
    identifier: getClientIp(request) ?? String(auth.user_id),
    limit: RATE_LIMITS.appFeedback.limit,
    windowSec: RATE_LIMITS.appFeedback.windowSec,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'invalid JSON', 400);
  }

  const parsed = appFeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'invalid payload', 400, parsed.error.flatten());
  }

  const result = await recordAppFeedback({
    athleteUserId: Number(auth.user_id),
    input: parsed.data,
  });

  return jsonOk({ saved: true, id: result.id, email_sent: result.email_sent });
}
