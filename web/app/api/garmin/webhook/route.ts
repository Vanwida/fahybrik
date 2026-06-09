// POST /api/garmin/webhook
//
// Receives push notifications from Garmin Health. Verifies HMAC-SHA256
// signature (timing-safe) against GARMIN_WEBHOOK_SECRET (or falls back to
// GARMIN_CONSUMER_SECRET when no separate webhook key is provisioned).
// Then resolves each summary's userAccessToken → athlete_id and ingests
// dailies/sleeps/activities/HRV/userMetrics/bodyComps/stressDetails into
// biometric_streams + workout_executions + segment_executions.
//
// Idempotent on (athlete_id, source='garmin', external_id). Garmin wins
// over HealthKit when a workout exists in both sources.

import { gatedResponse, loadGarminConfig, verifyWebhookSignature } from '@/lib/garmin';
import { hashGarminAccessToken } from '@/lib/garmin/token-store';
import { sql } from '@/lib/db';
import { ingestGarminPayload, type GarminPayload } from '@/lib/sync/ingest-garmin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const cfg = loadGarminConfig();
  if (!cfg.ok) return gatedResponse(cfg.missing);

  const rawBody = await request.text();

  const sigHeader =
    request.headers.get('x-garmin-signature') ?? request.headers.get('x-hub-signature-256');
  const valid = verifyWebhookSignature({
    rawBody,
    signatureHeader: sigHeader,
    consumerSecret: cfg.config.consumer_secret,
    webhookSecret: process.env.GARMIN_WEBHOOK_SECRET,
  });
  if (!valid) {
    return jsonError(401, 'invalid_signature', 'webhook signature missing or invalid');
  }

  let payload: GarminPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonError(400, 'invalid_json', 'webhook body is not valid JSON');
  }

  const result = await ingestGarminPayload({
    sql,
    payload,
    rawBody,
    resolveAthlete: (token) => resolveUserAccessToken(token),
  });

  return new Response(JSON.stringify({ ok: true, ...result }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

// Resolve a Garmin userAccessToken → athlete_id via a single indexed lookup on
// `garmin_oauth_tokens.access_token_sha256` (Finding M15). We hash the incoming
// token and match the UNIQUE index — O(1), and we never decrypt anyone's token
// here. The plaintext token is only needed to CALL Garmin (loadGarminTokens),
// not to identify the athlete, so no decrypt happens on the inbound path.
async function resolveUserAccessToken(userAccessToken: string): Promise<bigint | null> {
  const hash = hashGarminAccessToken(userAccessToken);
  const rows = await sql<{ athlete_id: bigint }[]>`
    select athlete_id from garmin_oauth_tokens
    where access_token_sha256 = ${hash}
    limit 1
  `;
  return rows[0]?.athlete_id ?? null;
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
