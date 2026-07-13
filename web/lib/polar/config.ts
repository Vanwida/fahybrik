// Polar AccessLink (OAuth 2.0) endpoint config + env-gating helpers.
//
// Production credentials are gated on Polar developer-program registration
// (admin.polaraccesslink.com). Until the env vars are provisioned, /api/polar/*
// endpoints return 503 with a clear message rather than a 500 — mirrors
// lib/coros/config.ts corosGatedResponse.
//
// GROUND TRUTH. Our Polar developer client is a v4 "AccessLink Dynamic API" app
// (confirmed empirically: the v4 token endpoint at auth.polar.com authenticates
// our credentials — a legacy v3 host does not). So both OAuth AND data reads are
// v4:
//   - OAuth 2.0 Authorization Code, CONFIDENTIAL client (secret server-side).
//   - Authorize: https://auth.polar.com/oauth/authorize
//   - Token:     https://auth.polar.com/oauth/token
//     Token endpoint requires HTTP Basic client auth (client_secret_basic) →
//     basicAuth:true on exchangeCodeForTokens / refreshAccessToken.
//   - Scopes: GRANULAR per-endpoint, space-separated read scopes (verified against
//     the v4 OpenAPI spec's per-endpoint security):
//       training_sessions:read activity:read sleep:read continuous_samples:read
//       nightly_recharge:read profile:read sports:read tests:read
//   - Data API: v4 Dynamic API, PULL-ONLY (no webhooks). Base is the host
//     `https://www.polaraccesslink.com`; the client (lib/polar/accesslink.ts)
//     appends `/v4/data/...` (training-sessions/list, sleeps,
//     nightly-recharge-results, sports/list). A cron poller
//     (lib/cron/polar-sync) drives ingestion over from/to date windows.
//   Spec: https://www.polar.com/polar-api-v4/ (version v4).

export const POLAR_ENDPOINTS = {
  authorize: 'https://auth.polar.com/oauth/authorize',
  token: 'https://auth.polar.com/oauth/token',
  // Host for the v4 data endpoints (client appends /v4/data/...). Overridable via
  // POLAR_API_BASE.
  apiBase: 'https://www.polaraccesslink.com',
} as const;

// v4 granular read scopes, space-separated (see file header). Overridable via
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
  // Host for the v4 data endpoints (client appends /v4/data/... — see header).
  apiBase: string;
  // Space-separated OAuth scopes sent on the authorize redirect.
  scopes: string;
};

export type PolarConfigResult =
  | { ok: true; config: PolarConfig }
  | { ok: false; missing: string[] };

export function loadPolarConfig(): PolarConfigResult {
  const clientId = process.env.POLAR_CLIENT_ID;
  const clientSecret = process.env.POLAR_CLIENT_SECRET;
  const callbackUrl = process.env.POLAR_OAUTH_CALLBACK_URL;

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
      // Host for the v4 data endpoints (see header). Overridable via POLAR_API_BASE.
      apiBase: process.env.POLAR_API_BASE || POLAR_ENDPOINTS.apiBase,
      scopes: process.env.POLAR_SCOPES || POLAR_DEFAULT_SCOPES,
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
