// WHOOP OAuth 2.0 endpoint config + env-gating helpers.
//
// WHOOP is a confidential OAuth2 client: the Client Secret stays server-side and
// is ALSO the key used to verify inbound webhook signatures. Until the WHOOP
// developer credentials are provisioned, /api/whoop/* endpoints return 503 with
// a clear message rather than a 500. Mirrors lib/garmin/config.ts.
//
// Verified against developer.whoop.com (v2):
//   authorize: GET  https://api.prod.whoop.com/oauth/oauth2/auth
//   token:     POST https://api.prod.whoop.com/oauth/oauth2/token
//   api base:        https://api.prod.whoop.com/developer
//
// Scopes are space-separated; `offline` is REQUIRED to receive a refresh token.

export const WHOOP_ENDPOINTS = {
  authorize: 'https://api.prod.whoop.com/oauth/oauth2/auth',
  token: 'https://api.prod.whoop.com/oauth/oauth2/token',
  api_base: 'https://api.prod.whoop.com/developer',
} as const;

// `offline` MUST be present or WHOOP issues no refresh token (access tokens
// expire in 1h, so without it the connection silently dies after an hour).
export const WHOOP_SCOPES = [
  'read:recovery',
  'read:cycles',
  'read:workout',
  'read:sleep',
  'read:profile',
  'read:body_measurement',
  'offline',
].join(' ');

export type WhoopConfig = {
  clientId: string;
  clientSecret: string;
  authorizeEndpoint: string;
  tokenEndpoint: string;
  apiBase: string;
  callbackUrl: string;
  scopes: string;
};

export type WhoopConfigResult =
  | { ok: true; config: WhoopConfig }
  | { ok: false; missing: string[] };

export function loadWhoopConfig(): WhoopConfigResult {
  const clientId = process.env.WHOOP_CLIENT_ID;
  const clientSecret = process.env.WHOOP_CLIENT_SECRET;
  const callbackUrl = process.env.WHOOP_OAUTH_CALLBACK_URL;
  const missing: string[] = [];
  if (!clientId) missing.push('WHOOP_CLIENT_ID');
  if (!clientSecret) missing.push('WHOOP_CLIENT_SECRET');
  if (!callbackUrl) missing.push('WHOOP_OAUTH_CALLBACK_URL');
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    config: {
      clientId: clientId!,
      clientSecret: clientSecret!,
      authorizeEndpoint: WHOOP_ENDPOINTS.authorize,
      tokenEndpoint: WHOOP_ENDPOINTS.token,
      apiBase: WHOOP_ENDPOINTS.api_base,
      callbackUrl: callbackUrl!,
      scopes: WHOOP_SCOPES,
    },
  };
}

export function whoopGatedResponse(missing: string[]): Response {
  return new Response(
    JSON.stringify({
      error: 'whoop_not_configured',
      message:
        'WHOOP OAuth integration is not configured. Required env vars are missing.',
      missing_env: missing,
      docs: '/docs/whoop_oauth.md',
    }),
    { status: 503, headers: { 'content-type': 'application/json' } },
  );
}
