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

// Resolve a Garmin userAccessToken → athlete_id. Tokens are encrypted at
// rest in `garmin_oauth_tokens.access_token_encrypted`; we decrypt the row
// set and match. Acceptable while the connected athlete count is small;
// switch to a sha256-of-token index column when it grows.
async function resolveUserAccessToken(userAccessToken: string): Promise<bigint | null> {
  const { decrypt } = await import('@/lib/crypto/aes-gcm');
  const rows = await sql<{ athlete_id: bigint; access_token_encrypted: Buffer }[]>`
    select athlete_id, access_token_encrypted from garmin_oauth_tokens
  `;
  for (const r of rows) {
    let plain: string;
    try {
      plain = decrypt(r.access_token_encrypted);
    } catch {
      continue;
    }
    if (plain === userAccessToken) return r.athlete_id;
  }
  return null;
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
