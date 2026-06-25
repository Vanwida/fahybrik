// Polar AccessLink (OAuth 2.0) endpoint config + env-gating helpers.
//
// Production credentials are gated on Polar developer-program registration
// (admin.polaraccesslink.com). Until the env vars are provisioned, /api/polar/*
// endpoints return 503 with a clear message rather than a 500 — mirrors
// lib/coros/config.ts corosGatedResponse.
//
// GROUND TRUTH (verified against polar.com official AccessLink docs):
//   - OAuth 2.0 Authorization Code, CONFIDENTIAL client (secret server-side).
//   - Authorize endpoint (public, confirmed):
//       https://auth.polar.com/oauth/authorize
//   - Token endpoint (public, confirmed):
//       https://auth.polar.com/oauth/token
//     The token endpoint requires HTTP Basic auth = base64(client_id:client_secret)
//     in the Authorization header (client_secret_basic), NOT credentials in the
//     body. We pass basicAuth:true to exchangeCodeForTokens / refreshAccessToken.
//   - Access token ~12h lifetime + a refresh token (grant_type=refresh_token,
//     also Basic-auth'd).
//   - Scopes (v4, space-separated, read-only):
//       training_sessions:read activity:read sleep:read continuous_samples:read
//       nightly_recharge:read profile:read sports:read tests:read
//   - Webhooks: Polar POSTs events; the payload carries an HMAC signature header.
//     The exact v4 API base is not fully confirmed publicly, so POLAR_API_BASE is
//     env-configurable with a default treated as TO-CONFIRM.

export const POLAR_ENDPOINTS = {
  // Public + confirmed.
  authorize: 'https://auth.polar.com/oauth/authorize',
  token: 'https://auth.polar.com/oauth/token',
  // TO CONFIRM for v4 — overridable via POLAR_API_BASE.
  apiBase: 'https://www.polaraccesslink.com',
} as const;

// v4 read-only scopes, space-separated (see file header). Overridable via
// POLAR_SCOPES for forward-compat if Polar adds/renames scopes.
export const POLAR_DEFAULT_SCOPES = [
  'training_sessions:read',
  'activity:read',
  'sleep:read',
  'continuous_samples:read',
  'nightly_recharge:read',
  'profile:read',
  'sports:read',
  'tests:read',
].join(' ');

export type PolarConfig = {
  clientId: string;
  clientSecret: string;
  authorizeEndpoint: string;
  tokenEndpoint: string;
  callbackUrl: string;
  // v4 API base for outbound reads (TO CONFIRM — see file header).
  apiBase: string;
  // Space-separated OAuth scopes sent on the authorize redirect.
  scopes: string;
  // Optional shared secret used to verify inbound webhook HMAC signatures. When
  // unset, the webhook accepts unsigned requests (acceptable during bring-up).
  webhookSecret?: string;
};

export type PolarConfigResult =
  | { ok: true; config: PolarConfig }
  | { ok: false; missing: string[] };

export function loadPolarConfig(): PolarConfigResult {
  const clientId = process.env.POLAR_CLIENT_ID;
  const clientSecret = process.env.POLAR_CLIENT_SECRET;
  const callbackUrl = process.env.POLAR_OAUTH_CALLBACK_URL;
  const webhookSecret = process.env.POLAR_WEBHOOK_SECRET;

  const missing: string[] = [];
  if (!clientId) missing.push('POLAR_CLIENT_ID');
  if (!clientSecret) missing.push('POLAR_CLIENT_SECRET');
  if (!callbackUrl) missing.push('POLAR_OAUTH_CALLBACK_URL');
  if (missing.length > 0) return { ok: false, missing };

  return {
    ok: true,
    config: {
      clientId: clientId!,
      clientSecret: clientSecret!,
      authorizeEndpoint: process.env.POLAR_AUTHORIZE_URL || POLAR_ENDPOINTS.authorize,
      tokenEndpoint: process.env.POLAR_TOKEN_URL || POLAR_ENDPOINTS.token,
      callbackUrl: callbackUrl!,
      // TO CONFIRM for v4 (see file header). Overridable via POLAR_API_BASE.
      apiBase: process.env.POLAR_API_BASE || POLAR_ENDPOINTS.apiBase,
      scopes: process.env.POLAR_SCOPES || POLAR_DEFAULT_SCOPES,
      webhookSecret: webhookSecret && webhookSecret.length > 0 ? webhookSecret : undefined,
    },
  };
}

export function polarGatedResponse(missing: string[]): Response {
  return new Response(
    JSON.stringify({
      error: 'polar_not_configured',
      message:
        'Polar AccessLink integration is gated on developer-program registration. Required env vars are missing.',
      missing_env: missing,
      docs: '/docs/polar_oauth.md',
    }),
    { status: 503, headers: { 'content-type': 'application/json' } },
  );
}
