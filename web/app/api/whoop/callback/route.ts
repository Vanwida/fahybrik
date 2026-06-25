// GET /api/whoop/callback?code=...&state=...   (or ?error=...)
//
// Handles the WHOOP OAuth 2.0 authorization-code callback. Validates the state
// cookie (CSRF + recovers athlete_id), exchanges the code for tokens, fetches the
// WHOOP user_id for webhook reverse-lookup, and persists the encrypted connection
// into wearable_connections. Mirrors /api/garmin/callback.

import { loadWhoopConfig, whoopGatedResponse } from '@/lib/whoop/config';
import { exchangeCodeForTokens, OAuth2Error } from '@/lib/oauth/oauth2';
import { readStateCookie, clearStateCookie } from '@/lib/oauth/state';
import { saveWearableConnection, type WearableTokenSet } from '@/lib/wearables/token-store';
import { isCryptoConfigured } from '@/lib/crypto/aes-gcm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// WHOOP profile endpoint we hit to obtain the stable user_id used as
// provider_user_id (the webhook payload only carries user_id, so we must know it
// to resolve an athlete on push). v2: GET /v2/user/profile/basic.
const PROFILE_PATH = '/v2/user/profile/basic';

// Cap the profile fetch so a hung WHOOP API can't wedge the callback. The fetch
// is best-effort: if it fails we still persist the connection (without
// provider_user_id) and leave a follow-up rather than dropping the tokens.
const PROFILE_TIMEOUT_MS = 10_000;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const secure = url.protocol === 'https:';

  // WHOOP returns ?error=access_denied (etc.) if the athlete declines consent.
  const providerError = url.searchParams.get('error');
  if (providerError) {
    return jsonOkFalse(
      400,
      'whoop_authorization_denied',
      clearStateCookie('whoop', secure),
    );
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) {
    return jsonError(400, 'invalid_callback', 'code and state query params are required');
  }

  const cfg = loadWhoopConfig();
  if (!cfg.ok) return whoopGatedResponse(cfg.missing);

  if (!isCryptoConfigured()) {
    return jsonError(
      503,
      'encryption_not_configured',
      'ENCRYPTION_KEY env var is required to persist OAuth tokens. See /docs/whoop_oauth.md.',
    );
  }

  // Validate the state cookie set by /api/whoop/connect: matches provider + nonce,
  // not expired, and recovers which athlete started the flow. A mismatch means
  // CSRF / replay / expired flow → abort.
  const stash = readStateCookie({
    provider: 'whoop',
    cookieHeader: request.headers.get('cookie'),
    state,
  });
  if (!stash) {
    return jsonOkFalse(401, 'invalid_state', clearStateCookie('whoop', secure));
  }
  const athlete_id = stash.athlete_id;

  // Exchange the authorization code for tokens. Any non-2xx / unreachable /
  // unparseable response surfaces as OAuth2Error and maps to a 502.
  let tokenRes;
  try {
    tokenRes = await exchangeCodeForTokens({
      tokenEndpoint: cfg.config.tokenEndpoint,
      clientId: cfg.config.clientId,
      clientSecret: cfg.config.clientSecret,
      code,
      redirectUri: cfg.config.callbackUrl,
    });
  } catch (e) {
    if (e instanceof OAuth2Error) {
      return jsonOkFalse(502, 'whoop_token_exchange_failed', clearStateCookie('whoop', secure));
    }
    throw e;
  }

  // Best-effort: fetch the WHOOP user_id for webhook reverse-lookup. If WHOOP is
  // unreachable or shapes the body unexpectedly, persist the connection WITHOUT
  // provider_user_id (the access-token hash still allows resolution) and leave a
  // TODO to backfill it.
  // TODO(whoop): if provider_user_id is null here, backfill it on first webhook
  // or via a scheduled job, since webhook payloads key on user_id.
  const providerUserId = await fetchWhoopUserId(cfg.config.apiBase, tokenRes.access_token);

  const expires_at =
    typeof tokenRes.expires_in === 'number'
      ? new Date(Date.now() + tokenRes.expires_in * 1000)
      : null;

  const tokens: WearableTokenSet = {
    access_token: tokenRes.access_token,
    refresh_token: tokenRes.refresh_token ?? null,
    expires_at,
    // Persist the granted scopes (WHOOP echoes them on the token response).
    scopes: tokenRes.scope ?? cfg.config.scopes,
  };

  await saveWearableConnection({
    athlete_id,
    provider: 'whoop',
    provider_user_id: providerUserId,
    tokens,
  });

  return new Response(JSON.stringify({ ok: true, athlete_id: athlete_id.toString() }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': clearStateCookie('whoop', secure),
    },
  });
}

// GET {apiBase}/v2/user/profile/basic → { user_id, email, first_name, last_name }.
// Returns the user_id as a string for provider_user_id, or null on any failure
// (defensive — never throws; the caller proceeds without it).
async function fetchWhoopUserId(apiBase: string, accessToken: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROFILE_TIMEOUT_MS);
  try {
    const res = await fetch(`${apiBase}${PROFILE_PATH}`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { user_id?: unknown };
    if (typeof body.user_id === 'number' || typeof body.user_id === 'string') {
      return String(body.user_id);
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// Failure responses for this route use the {ok:false,error} shape (per the WHOOP
// route contract) and burn the transient state cookie.
function jsonOkFalse(status: number, error: string, clearCookie: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { 'content-type': 'application/json', 'set-cookie': clearCookie },
  });
}
