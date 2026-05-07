// GET /api/garmin/callback?oauth_token=...&oauth_verifier=...&athlete_id=...
//
// Handles the OAuth 1.0a callback. Exchanges request token + verifier for an
// access token, encrypts it, and persists into garmin_oauth_tokens.

import { gatedResponse, GARMIN_ENDPOINTS, loadGarminConfig, signOAuth1 } from '@/lib/garmin';
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
      'ENCRYPTION_KEY env var is required to persist OAuth tokens. See /docs/garmin_oauth.md.',
    );
  }

  const { authHeader } = signOAuth1({
    method: 'POST',
    url: GARMIN_ENDPOINTS.access_token,
    consumer_secret: cfg.config.consumer_secret,
    // The token secret stored from the request_token step would normally go
    // here. Garmin's flow allows omitting it (signing key becomes
    // consumer_secret&"") because the verifier ties the call to the user.
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

  await saveGarminTokens({
    athlete_id,
    tokens: { access_token, token_secret },
  });

  return new Response(JSON.stringify({ ok: true, athlete_id: athlete_id.toString() }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
