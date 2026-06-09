// GET /api/garmin/connect?athlete_id=<id>
//
// Initiates an OAuth 1.0a request-token flow with Garmin Connect. On success,
// redirects the browser to Garmin's authorize page; on partner-approval gating
// (env vars missing) returns 503.

import {
  buildRequestTokenCookie,
  gatedResponse,
  GARMIN_ENDPOINTS,
  loadGarminConfig,
  signOAuth1,
} from '@/lib/garmin';
import { isCryptoConfigured } from '@/lib/crypto/aes-gcm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const athlete_id_raw = url.searchParams.get('athlete_id');
  if (!athlete_id_raw || !/^\d+$/.test(athlete_id_raw)) {
    return jsonError(400, 'invalid_athlete_id', 'athlete_id query param is required and must be numeric');
  }
  const athlete_id = athlete_id_raw;

  const cfg = loadGarminConfig();
  if (!cfg.ok) return gatedResponse(cfg.missing);

  // We persist the request-token secret in an encrypted cookie for the
  // access_token exchange, so ENCRYPTION_KEY must be set before we begin.
  if (!isCryptoConfigured()) {
    return jsonError(
      503,
      'encryption_not_configured',
      'ENCRYPTION_KEY env var is required to begin the Garmin OAuth flow. See /docs/garmin_setup.md.',
    );
  }

  // The callback URL gets the athlete_id appended so the callback handler can
  // pair the inbound oauth_token with the right athlete. (Garmin echoes the
  // callback verbatim and oauth_token, so this works.)
  const callbackWithAthlete = appendQuery(cfg.config.callback_url, { athlete_id });

  const { authHeader } = signOAuth1({
    method: 'POST',
    url: GARMIN_ENDPOINTS.request_token,
    consumer_secret: cfg.config.consumer_secret,
    oauth_params: {
      oauth_consumer_key: cfg.config.consumer_key,
      oauth_callback: callbackWithAthlete,
    },
  });

  let res: Response;
  try {
    res = await fetch(GARMIN_ENDPOINTS.request_token, {
      method: 'POST',
      headers: { authorization: authHeader, 'content-length': '0' },
    });
  } catch (e) {
    return jsonError(502, 'garmin_unreachable', `failed to reach Garmin: ${(e as Error).message}`);
  }

  if (!res.ok) {
    const body = await res.text();
    return jsonError(502, 'garmin_request_token_failed', `request_token returned ${res.status}: ${body}`);
  }

  const text = await res.text();
  const parsed = parseFormUrlEncoded(text);
  const oauth_token = parsed.get('oauth_token');
  const oauth_token_secret = parsed.get('oauth_token_secret');
  if (!oauth_token || !oauth_token_secret) {
    return jsonError(
      502,
      'garmin_invalid_response',
      'request_token response missing oauth_token / oauth_token_secret',
    );
  }

  // Stash the request-token secret (encrypted, HttpOnly, SameSite=Lax) so the
  // callback can use it as the OAuth1 token secret for the access_token
  // exchange. Garmin's signing key for that step is consumer_secret&token_secret.
  const cookie = buildRequestTokenCookie({
    athlete_id,
    oauth_token,
    oauth_token_secret,
    secure: url.protocol === 'https:',
  });

  const authorizeUrl = `${GARMIN_ENDPOINTS.authorize}?oauth_token=${encodeURIComponent(oauth_token)}`;
  return new Response(null, {
    status: 302,
    headers: { location: authorizeUrl, 'set-cookie': cookie },
  });
}

function appendQuery(base: string, params: Record<string, string>): string {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

function parseFormUrlEncoded(body: string): URLSearchParams {
  return new URLSearchParams(body);
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
