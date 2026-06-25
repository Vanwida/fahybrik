// GET /api/amazfit/callback?code=...&state=...
//
// Handles the Amazfit / Zepp (Huami Web API) OAuth 2.0 authorization-code
// callback. Verifies the CSRF state cookie to recover which athlete started the
// flow, exchanges the code for tokens, captures the Huami user id when present,
// and persists the connection (encrypted at rest) into wearable_connections via
// the provider-agnostic store.
//
// Mirrors /api/coros/callback route shape and JSON error contract. Note: the
// Huami authorization code is valid for only 5 minutes, and the access token
// defaults to 90 days / refresh token 10 years — we persist expires_at from
// expires_in when present.

import { amazfitGatedResponse, loadAmazfitConfig } from '@/lib/amazfit/config';
import { exchangeCodeForTokens, OAuth2Error } from '@/lib/oauth/oauth2';
import { clearStateCookie, readStateCookie } from '@/lib/oauth/state';
import {
  saveWearableConnection,
  type WearableProvider,
  type WearableTokenSet,
} from '@/lib/wearables/token-store';
import { isCryptoConfigured } from '@/lib/crypto/aes-gcm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const AMAZFIT_PROVIDER: WearableProvider = 'amazfit';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // Zepp/Huami surfaces user-denial / provider errors as ?error=... — surface it
  // verbatim rather than treating a missing code as our own bug.
  const providerError = url.searchParams.get('error');
  if (providerError) {
    const description = url.searchParams.get('error_description') ?? undefined;
    return jsonError(400, 'amazfit_authorization_error', description ?? providerError);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code) {
    return jsonError(400, 'invalid_callback', 'code query param is required');
  }

  const cfg = loadAmazfitConfig();
  if (!cfg.ok) return amazfitGatedResponse(cfg.missing);

  if (!isCryptoConfigured()) {
    return jsonError(
      503,
      'encryption_not_configured',
      'ENCRYPTION_KEY env var is required to persist OAuth tokens. See /docs/amazfit_setup.md.',
    );
  }

  const secure = isSecureRequest(request, url);

  // Recover + validate the athlete via the encrypted state cookie set by
  // /api/amazfit/connect. A missing / expired / mismatched-nonce cookie is a CSRF
  // or replayed-callback signal → abort.
  const recovered = readStateCookie({
    provider: AMAZFIT_PROVIDER,
    cookieHeader: request.headers.get('cookie'),
    state: state ?? '',
  });
  if (!recovered) {
    return jsonError(401, 'invalid_state', 'state cookie is missing, expired, or does not match this callback');
  }
  const athlete_id = recovered.athlete_id;

  // Exchange the authorization code for tokens. Wrap the external call; any
  // failure (non-2xx, unreachable, timeout, bad body) maps to a single 502.
  let tokens;
  try {
    tokens = await exchangeCodeForTokens({
      tokenEndpoint: cfg.config.tokenEndpoint,
      clientId: cfg.config.clientId,
      clientSecret: cfg.config.clientSecret,
      code,
      redirectUri: cfg.config.callbackUrl,
    });
  } catch (e) {
    if (e instanceof OAuth2Error) {
      return jsonError(502, 'amazfit_token_exchange_failed', e.message);
    }
    return jsonError(502, 'amazfit_token_exchange_failed', (e as Error).message);
  }

  // Huami token responses carry a stable user id (the wiki's token-verify
  // endpoint returns `userId`). Be defensive: check the common variants in the
  // raw body. This id is what the webhook uses to resolve athlete_id
  // (findConnectionByProviderUser).
  const provider_user_id = extractProviderUserId(tokens.raw);

  const tokenSet: WearableTokenSet = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    expires_at: tokens.expires_in != null ? new Date(Date.now() + tokens.expires_in * 1000) : null,
    // Persist whatever scope string the provider echoes (semicolon-separated).
    scopes: tokens.scope ?? null,
  };

  await saveWearableConnection({
    athlete_id,
    provider: AMAZFIT_PROVIDER,
    provider_user_id,
    tokens: tokenSet,
  });

  // Burn the transient state cookie now that the exchange succeeded.
  return new Response(JSON.stringify({ ok: true, athlete_id: athlete_id.toString() }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': clearStateCookie(AMAZFIT_PROVIDER, secure),
    },
  });
}

// Huami's user-id field is `userId` per the token-verify wiki, but the access-
// token response shape is from old docs — check the common keys without
// hardcoding a single assumption. Returns null when none is present.
function extractProviderUserId(raw: Record<string, unknown>): string | null {
  for (const key of ['userId', 'user_id', 'userID', 'openId', 'open_id', 'uid']) {
    const v = raw[key];
    if (typeof v === 'string' && v.length > 0) return v;
    if (typeof v === 'number') return String(v);
  }
  return null;
}

// Secure when the request is HTTPS. Behind a proxy (Vercel) the inbound URL may
// be http while the public URL is https, so honor x-forwarded-proto too.
function isSecureRequest(request: Request, url: URL): boolean {
  if (url.protocol === 'https:') return true;
  const fwd = request.headers.get('x-forwarded-proto');
  return fwd != null && fwd.split(',')[0].trim() === 'https';
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: code, message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
