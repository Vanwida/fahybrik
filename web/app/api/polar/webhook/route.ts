// Polar AccessLink webhook + health endpoint.
//
//   POST /api/polar/webhook   — Polar event push (EXERCISE / SLEEP / etc.)
//   GET  /api/polar/webhook   — liveness probe (returns 200 {ok:true})
//
// Polar delivers events by PUSH. We read the RAW body, optionally verify an
// HMAC-SHA256 signature header, resolve the Polar user id → athlete_id, and hand
// the payload to the ingestion entry point. We ALWAYS respond 200 fast on a valid
// (or unsigned-when-no-secret) request, and never 4xx a well-formed webhook over
// an unknown user (the user may simply not be connected here).
//
// Mirrors /api/coros/webhook route shape and the lib/sync ingest split (route
// resolves athlete + delegates to an ingest module).

import { polarGatedResponse, loadPolarConfig } from '@/lib/polar/config';
import {
  findConnectionByProviderUser,
  type WearableProvider,
} from '@/lib/wearables/token-store';
import { ingestPolar } from '@/lib/sync/ingest-polar';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const POLAR_PROVIDER: WearableProvider = 'polar';

// GET doubles as a liveness probe Polar (or our own monitoring) can hit to
// confirm the endpoint is up. No auth, no body inspection; just 200.
export async function GET(): Promise<Response> {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(request: Request): Promise<Response> {
  const cfg = loadPolarConfig();
  if (!cfg.ok) return polarGatedResponse(cfg.missing);

  const rawBody = await request.text();

  // SIGNATURE VERIFICATION
  // ----------------------
  // ASSUMPTION (Polar's exact scheme is documented in their AccessLink webhook
  // docs): when a webhook is registered with a signature secret, Polar signs the
  // raw request body with HMAC-SHA256 and sends it in the `Polar-Webhook-Signature`
  // header (lowercase hex). We gate this on POLAR_WEBHOOK_SECRET:
  //   * if POLAR_WEBHOOK_SECRET is set, we REQUIRE a valid HMAC-SHA256 signature
  //     header (hex or base64), compared timing-safely;
  //   * if POLAR_WEBHOOK_SECRET is NOT set, we accept the request unsigned (the
  //     bring-up phase). Tighten by setting the env var once Polar confirms the
  //     exact header name / encoding.
  if (cfg.config.webhookSecret) {
    if (!isWebhookAuthorized(request, rawBody, cfg.config.webhookSecret)) {
      return jsonError(401, 'invalid_signature', 'webhook signature missing or invalid');
    }
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonError(400, 'invalid_json', 'webhook body is not valid JSON');
  }

  // Resolve the Polar user id → athlete_id. We never 4xx a valid, signed webhook
  // for an unknown user: respond 200 {ok:true, ignored:true} so Polar does not
  // retry/disable the endpoint over someone who isn't connected here.
  const provider_user_id = extractProviderUserId(payload);
  if (!provider_user_id) {
    return new Response(JSON.stringify({ ok: true, ignored: true, reason: 'no_user_id' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  const conn = await findConnectionByProviderUser({
    provider: POLAR_PROVIDER,
    provider_user_id,
  });
  if (!conn) {
    return new Response(JSON.stringify({ ok: true, ignored: true, reason: 'unknown_user' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  await ingestPolar(conn.athlete_id, payload);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

// Verify an HMAC-SHA256 signature over the raw body under the shared secret.
// Probes the common Polar/standard header names; comparison is timing-safe.
function isWebhookAuthorized(request: Request, rawBody: string, secret: string): boolean {
  for (const header of ['polar-webhook-signature', 'x-polar-signature', 'signature']) {
    const sig = request.headers.get(header);
    if (sig && verifyHmacSha256(rawBody, sig, secret)) return true;
  }
  return false;
}

// HMAC-SHA256 of the raw body, accepting the header as lowercase hex or base64,
// compared timing-safely. Mirrors lib/coros/webhook verifyHmacSha256.
function verifyHmacSha256(rawBody: string, signatureHeader: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(Buffer.from(rawBody, 'utf8')).digest();
  let received: Buffer;
  try {
    if (/^[0-9a-fA-F]+$/.test(signatureHeader) && signatureHeader.length === expected.length * 2) {
      received = Buffer.from(signatureHeader, 'hex');
    } else {
      received = Buffer.from(signatureHeader, 'base64');
    }
  } catch {
    return false;
  }
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}

// Polar's exact user-id field varies; check the common keys without hardcoding a
// single assumption. Reads top-level and a one-level-deep `data` envelope (a
// common webhook shape). Returns null when none is present.
function extractProviderUserId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  const fromTop = pickUserId(obj);
  if (fromTop) return fromTop;
  const data = obj.data;
  if (data && typeof data === 'object') return pickUserId(data as Record<string, unknown>);
  return null;
}

function pickUserId(obj: Record<string, unknown>): string | null {
  for (const key of ['user_id', 'x_user_id', 'polar-user-id', 'x-user-id', 'userId', 'polarUserId']) {
    const v = obj[key];
    if (typeof v === 'string' && v.length > 0) return v;
    if (typeof v === 'number') return String(v);
  }
  return null;
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
