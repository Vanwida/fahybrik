// Amazfit / Zepp (Huami Web API) webhook + health endpoint.
//
//   POST /api/amazfit/webhook   — Huami subscription delivery endpoint
//   GET  /api/amazfit/webhook   — liveness probe (returns 200 {ok:true})
//
// Huami delivers data-change notifications by PUSH. We read the RAW body,
// optionally verify a shared-secret signature, resolve the Huami user id →
// athlete_id, and hand the payload to the ingestion entry point.
//
// CRITICAL Huami CONTRACT (per the wiki): the receiver MUST respond HTTP 204
// within ~2 seconds, or Huami marks the service failed, retries 3x within one
// minute, then STOPS the subscription WITHOUT WARNING. So we keep the POST path
// fast, return 204 (No Content) on success, and never 4xx a well-formed webhook
// over an unknown user (they may simply not be connected here). Ingestion must
// not block the response (the stub is a no-op today; a real impl should enqueue,
// not do heavy work inline).
//
// SIGNATURE — TO-CONFIRM: Huami signs webhooks RSA-SHA1 in a `Huami-Signature`
// header, verified against a region-specific RSA public key (e.g.
// https://user-cn.huami.com/certificates/rsa_public_key.pem; the EU/us-west-2
// key URL differs). RSA verification is not wired until the correct region key
// is confirmed on partner onboarding. Until then we gate on AMAZFIT_WEBHOOK_SECRET
// (shared-secret header), mirroring the COROS webhook bring-up posture.
//
// Mirrors /api/coros/webhook route shape and the lib/sync ingest split.

import { amazfitGatedResponse, loadAmazfitConfig } from '@/lib/amazfit/config';
import {
  findConnectionByProviderUser,
  type WearableProvider,
} from '@/lib/wearables/token-store';
import { ingestAmazfitWorkout } from '@/lib/sync/ingest-amazfit';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const AMAZFIT_PROVIDER: WearableProvider = 'amazfit';

// GET doubles as a liveness probe to confirm our endpoint is up. No auth, no
// body inspection; just 200.
export async function GET(): Promise<Response> {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(request: Request): Promise<Response> {
  const cfg = loadAmazfitConfig();
  if (!cfg.ok) return amazfitGatedResponse(cfg.missing);

  const rawBody = await request.text();

  // SIGNATURE VERIFICATION (TO-CONFIRM — see file header).
  // ------------------------------------------------------
  // Until RSA-SHA1 verification against Huami's region public key is wired, we
  // gate on AMAZFIT_WEBHOOK_SECRET:
  //   * if AMAZFIT_WEBHOOK_SECRET is set, we REQUIRE one of:
  //       - Huami-Signature / x-huami-signature: HMAC-SHA256(rawBody, secret) as
  //         lowercase hex (or base64), compared timing-safely; OR
  //       - a bearer/shared-secret header whose value equals the secret
  //         (Authorization: Bearer <secret> or x-amazfit-secret: <secret>),
  //         compared timing-safely.
  //   * if AMAZFIT_WEBHOOK_SECRET is NOT set, we accept the request unsigned
  //     (the pre-approval / bring-up phase). Tighten once the RSA key is known.
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

  // Resolve the Huami user id → athlete_id. We never 4xx a valid, signed webhook
  // for an unknown user: respond 200 {ok:true, ignored:true} so Huami does not
  // retry/disable the endpoint over someone who isn't connected here.
  const provider_user_id = extractProviderUserId(payload);
  if (!provider_user_id) {
    return new Response(JSON.stringify({ ok: true, ignored: true, reason: 'no_user_id' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  const conn = await findConnectionByProviderUser({
    provider: AMAZFIT_PROVIDER,
    provider_user_id,
  });
  if (!conn) {
    return new Response(JSON.stringify({ ok: true, ignored: true, reason: 'unknown_user' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  await ingestAmazfitWorkout(conn.athlete_id, payload);

  // Huami requires HTTP 204 (No Content) within ~2s to keep the subscription
  // alive (see header). 204 carries no body.
  return new Response(null, { status: 204 });
}

// Accept either an HMAC-SHA256 signature over the raw body, or a shared-secret
// header equal to the configured secret. All comparisons are timing-safe.
function isWebhookAuthorized(request: Request, rawBody: string, secret: string): boolean {
  // 1) HMAC-SHA256 hex/base64 of the raw body under the shared secret. Huami's
  //    real header is `Huami-Signature` (RSA-SHA1, TO-CONFIRM); accept that name
  //    plus an x- variant for the shared-secret bring-up.
  const sigHeader =
    request.headers.get('huami-signature') ?? request.headers.get('x-huami-signature');
  if (sigHeader && verifyHmacSha256(rawBody, sigHeader, secret)) return true;

  // 2) Plain shared-secret header match (bearer or x-amazfit-secret).
  const bearer = extractBearer(request.headers.get('authorization'));
  if (bearer && constantTimeEquals(bearer, secret)) return true;
  const secretHeader = request.headers.get('x-amazfit-secret');
  if (secretHeader && constantTimeEquals(secretHeader, secret)) return true;

  return false;
}

// HMAC-SHA256 of the raw body, accepting the header as lowercase hex or base64,
// compared timing-safely. Mirrors the COROS webhook verifier.
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

// Huami's user-id field is `userId` per the wiki; check the common keys without
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
  for (const key of ['userId', 'user_id', 'userID', 'openId', 'open_id', 'uid']) {
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
