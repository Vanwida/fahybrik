// COROS Open API webhook + health endpoint.
//
//   POST /api/coros/webhook   — "Workout data receiving Endpoint URL"
//   GET  /api/coros/webhook   — "Service Status Check URL" (returns 200 {ok:true})
//
// COROS delivers workout summaries by PUSH. We read the RAW body, optionally
// verify a shared-secret signature, resolve the COROS user id → athlete_id, and
// hand the payload to the ingestion entry point. We ALWAYS respond 200 fast on a
// valid (or unsigned-when-no-secret) request, and never 4xx a well-formed
// webhook over an unknown user (the user may simply not be connected here).
//
// Mirrors /api/garmin/webhook route shape and the lib/garmin ingest split
// (route resolves athlete + delegates to an ingest module).

import { corosGatedResponse, loadCorosConfig } from '@/lib/coros/config';
import {
  findConnectionByProviderUser,
  type WearableProvider,
} from '@/lib/wearables/token-store';
import { ingestCorosWorkout } from '@/lib/sync/ingest-coros';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COROS_PROVIDER: WearableProvider = 'coros';

// GET doubles as the COROS "Service Status Check URL" — a liveness probe COROS
// hits to confirm our endpoint is up. No auth, no body inspection; just 200.
export async function GET(): Promise<Response> {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(request: Request): Promise<Response> {
  const cfg = loadCorosConfig();
  if (!cfg.ok) return corosGatedResponse(cfg.missing);

  const rawBody = await request.text();

  // SIGNATURE VERIFICATION
  // ----------------------
  // COROS's exact signing scheme is in their private API Reference Guide, so we
  // implement the conventional pattern and gate it on COROS_WEBHOOK_SECRET:
  //   * if COROS_WEBHOOK_SECRET is set, we REQUIRE one of:
  //       - x-coros-signature: HMAC-SHA256(rawBody, secret) as lowercase hex
  //         (or base64), compared timing-safely; OR
  //       - a bearer/shared-secret header whose value equals the secret
  //         (Authorization: Bearer <secret> or x-coros-secret: <secret>),
  //         compared timing-safely.
  //   * if COROS_WEBHOOK_SECRET is NOT set, we accept the request unsigned (the
  //     pre-approval / Service-Status-Check phase). Tighten by setting the env
  //     var once COROS confirms the scheme.
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

  // Resolve the COROS user id → athlete_id. We never 4xx a valid, signed webhook
  // for an unknown user: respond 200 {ok:true, ignored:true} so COROS does not
  // retry/disable the endpoint over someone who isn't connected here.
  const provider_user_id = extractProviderUserId(payload);
  if (!provider_user_id) {
    return new Response(JSON.stringify({ ok: true, ignored: true, reason: 'no_user_id' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  const conn = await findConnectionByProviderUser({
    provider: COROS_PROVIDER,
    provider_user_id,
  });
  if (!conn) {
    return new Response(JSON.stringify({ ok: true, ignored: true, reason: 'unknown_user' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  await ingestCorosWorkout(conn.athlete_id, payload);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

// Accept either an HMAC-SHA256 signature over the raw body, or a shared-secret
// header equal to the configured secret. All comparisons are timing-safe.
function isWebhookAuthorized(request: Request, rawBody: string, secret: string): boolean {
  // 1) HMAC-SHA256 hex/base64 of the raw body under the shared secret.
  const sigHeader = request.headers.get('x-coros-signature');
  if (sigHeader && verifyHmacSha256(rawBody, sigHeader, secret)) return true;

  // 2) Plain shared-secret header match (bearer or x-coros-secret).
  const bearer = extractBearer(request.headers.get('authorization'));
  if (bearer && constantTimeEquals(bearer, secret)) return true;
  const secretHeader = request.headers.get('x-coros-secret');
  if (secretHeader && constantTimeEquals(secretHeader, secret)) return true;

  return false;
}

// HMAC-SHA256 of the raw body, accepting the header as lowercase hex or base64,
// compared timing-safely. Mirrors lib/garmin/oauth1 verifyWebhookSignature.
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

// Length-independent constant-time string compare (avoids leaking the secret
// length via early return). Hashes both sides to equal-length digests first.
function constantTimeEquals(a: string, b: string): boolean {
  const ha = createHmac('sha256', 'cmp').update(a).digest();
  const hb = createHmac('sha256', 'cmp').update(b).digest();
  return timingSafeEqual(ha, hb);
}

function extractBearer(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

// COROS's exact user-id field is in private docs; check the common keys without
// hardcoding a single assumption. Reads top-level and a one-level-deep `data`
// envelope (a common webhook shape). Returns null when none is present.
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
  for (const key of ['openId', 'open_id', 'user_id', 'userId', 'userID']) {
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
