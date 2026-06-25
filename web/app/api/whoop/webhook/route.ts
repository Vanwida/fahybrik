// POST /api/whoop/webhook
//
// Receives WHOOP push notifications. WHOOP signs each request with HMAC-SHA256
// over (timestamp header + raw body), keyed by the Client Secret, base64-encoded:
//
//   expected = base64( HMAC_SHA256( client_secret, X-WHOOP-Signature-Timestamp + rawBody ) )
//
// We verify (timing-safe) against the X-WHOOP-Signature header BEFORE parsing,
// reject 401 on any mismatch/missing header, then resolve the athlete via
// provider_user_id and hand off to the ingestion entry point. WHOOP webhooks are
// NOTIFICATIONS only ({user_id, id, type, trace_id}) — the actual object must be
// fetched from the WHOOP API. Responds 200 fast. Mirrors /api/garmin/webhook.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { loadWhoopConfig, whoopGatedResponse } from '@/lib/whoop/config';
import { findConnectionByProviderUser } from '@/lib/wearables/token-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// WHOOP notification payload (v2). This is a pointer, not the resource: ingestion
// must GET the object identified by `id` of kind `type` from the WHOOP API.
type WhoopWebhookEvent = {
  user_id: number;
  id: string;
  type: string;
  trace_id: string;
};

export async function POST(request: Request): Promise<Response> {
  const cfg = loadWhoopConfig();
  if (!cfg.ok) return whoopGatedResponse(cfg.missing);

  // Read the RAW body first — the signature is computed over the exact bytes, so
  // we must not re-serialize a parsed object.
  const rawBody = await request.text();

  const signature = request.headers.get('x-whoop-signature');
  const timestamp = request.headers.get('x-whoop-signature-timestamp');
  if (
    !verifyWhoopSignature({
      clientSecret: cfg.config.clientSecret,
      signature,
      timestamp,
      rawBody,
    })
  ) {
    return jsonOkFalse(401, 'invalid_signature');
  }

  let event: WhoopWebhookEvent;
  try {
    const parsed = JSON.parse(rawBody) as Partial<WhoopWebhookEvent>;
    if (
      (typeof parsed.user_id !== 'number' && typeof parsed.user_id !== 'string') ||
      typeof parsed.id !== 'string' ||
      typeof parsed.type !== 'string'
    ) {
      return jsonOkFalse(400, 'invalid_payload');
    }
    event = {
      user_id: Number(parsed.user_id),
      id: parsed.id,
      type: parsed.type,
      trace_id: typeof parsed.trace_id === 'string' ? parsed.trace_id : '',
    };
  } catch {
    return jsonOkFalse(400, 'invalid_json');
  }

  // Resolve which athlete this notification belongs to via the stable WHOOP
  // user_id. No row decryption on the inbound path (parity with Garmin).
  const conn = await findConnectionByProviderUser({
    provider: 'whoop',
    provider_user_id: String(event.user_id),
  });
  if (!conn) {
    // Unknown user_id (athlete never connected, or disconnected) — ack so WHOOP
    // doesn't retry, but do nothing.
    return new Response(JSON.stringify({ ok: true, ignored: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Hand off to ingestion. Kept intentionally lightweight so we ack WHOOP fast;
  // the heavy GET-the-object + persist work belongs behind this entry point.
  await ingestWhoopEvent(conn.athlete_id, event);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

// Verify the WHOOP webhook HMAC. Returns false on any missing header, bad base64,
// length mismatch, or non-matching digest. Timing-safe comparison.
function verifyWhoopSignature(params: {
  clientSecret: string;
  signature: string | null;
  timestamp: string | null;
  rawBody: string;
}): boolean {
  if (!params.signature || !params.timestamp) return false;
  // message = timestamp header value + raw request body (concatenated, in order).
  const message = params.timestamp + params.rawBody;
  const expected = createHmac('sha256', params.clientSecret).update(message, 'utf8').digest();

  let received: Buffer;
  try {
    received = Buffer.from(params.signature, 'base64');
  } catch {
    return false;
  }
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}

// =====================================================================
// TODO(whoop): ingestion entry point — STUB. Persists nothing yet.
//
// WHOOP webhooks are notifications: the payload carries only {user_id, id, type,
// trace_id}, NOT the data. The real implementation must, per `event.type`
// (e.g. recovery.updated, workout.updated, sleep.updated, cycle.updated):
//   1. loadWearableConnection({ athlete_id, provider: 'whoop' }) and refresh the
//      access token if expired (refreshAccessToken; persist the ROTATED refresh
//      token — WHOOP refresh tokens are single-use).
//   2. GET the object from {apiBase}/v2/... using `event.id`.
//   3. Map it into biometric_streams (recovery/sleep/cycle) or
//      workout_executions (workout) — IDEMPOTENT on (athlete_id, source='whoop',
//      external_id=event.id).
// Deliberately NOT implemented here: the biometric field mapping must be designed
// against real WHOOP v2 response shapes before we write any rows. Do not fabricate.
// =====================================================================
async function ingestWhoopEvent(_athlete_id: bigint, _event: WhoopWebhookEvent): Promise<void> {
  // Intentionally a no-op until the WHOOP v2 object mapping is designed.
  return;
}

function jsonOkFalse(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
