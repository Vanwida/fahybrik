// GET /api/garmin/callback?oauth_token=...&oauth_verifier=...&athlete_id=...
//
// Handles the OAuth 1.0a callback. Exchanges request token + verifier for an
// access token, encrypts it, and persists into garmin_oauth_tokens.

import {
  clearRequestTokenCookie,
  gatedResponse,
  GARMIN_ENDPOINTS,
  loadGarminConfig,
  readRequestTokenCookie,
  signOAuth1,
} from '@/lib/garmin';
import { saveGarminTokens } from '@/lib/garmin/token-store';
import { isCryptoConfigured } from '@/lib/crypto/aes-gcm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const oauth_token = url.searchParams.get('oauth_token');
  const oauth_verifier = url.searchParams.get('oauth_verifier');
  const athlete_id_raw = url.searchParams.get('athlete_id');

  if (!oauth_token || !oauth_verifier) {
    return jsonError(400, 'invalid_callback', 'oauth_token and oauth_verifier are required');
  }
  if (!athlete_id_raw || !/^\d+$/.test(athlete_id_raw)) {
    return jsonError(400, 'invalid_athlete_id', 'athlete_id query param required');
  }
  const athlete_id = BigInt(athlete_id_raw);

  const cfg = loadGarminConfig();
  if (!cfg.ok) return gatedResponse(cfg.missing);

  if (!isCryptoConfigured()) {
    return jsonError(
      503,
      'encryption_not_configured',
      'ENCRYPTION_KEY env var is required to persist OAuth tokens. See /docs/garmin_setup.md.',
    );
  }

  const secure = url.protocol === 'https:';

  // Recover the request-token secret stashed by /api/garmin/connect. It is the
  // OAuth1 token secret required to sign the access_token exchange (signing key
  // = consumer_secret&request_token_secret). The cookie is bound to this exact
  // athlete + oauth_token, so a mismatched/expired cookie aborts the flow.
  const stash = readRequestTokenCookie({
    cookieHeader: request.headers.get('cookie'),
    expected_athlete_id: athlete_id_raw,
    expected_oauth_token: oauth_token,
  });
  if (!stash) {
    return jsonError(
      400,
      'missing_request_token',
      'request-token secret cookie is missing, expired, or does not match this callback. Restart the connect flow.',
    );
  }

  const { authHeader } = signOAuth1({
    method: 'POST',
    url: GARMIN_ENDPOINTS.access_token,
    consumer_secret: cfg.config.consumer_secret,
    token_secret: stash.oauth_token_secret,
    oauth_params: {
      oauth_consumer_key: cfg.config.consumer_key,
      oauth_token,
      oauth_verifier,
    },
  });

  let res: Response;
  try {
    res = await fetch(GARMIN_ENDPOINTS.access_token, {
      method: 'POST',
      headers: { authorization: authHeader, 'content-length': '0' },
    });
  } catch (e) {
    return jsonError(502, 'garmin_unreachable', `failed to reach Garmin: ${(e as Error).message}`);
  }

  if (!res.ok) {
    const body = await res.text();
    return jsonError(502, 'garmin_access_token_failed', `access_token returned ${res.status}: ${body}`);
  }

  const text = await res.text();
  const parsed = new URLSearchParams(text);
  const access_token = parsed.get('oauth_token');
  const token_secret = parsed.get('oauth_token_secret');
  if (!access_token || !token_secret) {
    return jsonError(502, 'garmin_invalid_response', 'access_token response missing token fields');
  }

  const tokens = { access_token, token_secret };
  await saveGarminTokens({
    athlete_id,
    tokens,
  });

  // El pasado no llega solo: hay que pedirlo. No bloquea el callback — si Garmin
  // tarda o devuelve 4xx, la conexión sigue viva y el push en vivo funciona.
  // Los datos del backfill aterrizan por el mismo webhook de siempre.
  void import('@/lib/garmin/backfill')
    .then(({ runGarminBackfill }) => runGarminBackfill({ tokens }))
    .then((r) => {
      if (r.failed > 0) {
        console.warn(
          `[garmin/backfill] athlete=${athlete_id} accepted=${r.accepted} failed=${r.failed}`,
          r.requested.filter((x) => !x.ok).map((x) => `${x.type}:${x.status ?? x.detail}`),
        );
      }
    })
    .catch((e) => {
      console.warn(`[garmin/backfill] athlete=${athlete_id} error`, (e as Error).message);
    });

  // Burn the transient request-token cookie now that the exchange succeeded.
  return new Response(JSON.stringify({ ok: true, athlete_id: athlete_id.toString() }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': clearRequestTokenCookie(secure),
    },
  });
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
