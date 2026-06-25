// COROS Open API (OAuth 2.0) endpoint config + env-gating helpers.
//
// Production credentials are gated on COROS developer-program approval. Until
// the env vars are provisioned, /api/coros/* endpoints return 503 with a clear
// message rather than a 500 — mirrors lib/garmin/config.ts gatedResponse.
//
// GROUND TRUTH (verified against COROS official sources):
//   - OAuth 2.0 Authorization Code, confidential client (secret server-side).
//   - Authorize endpoint is public and confirmed live:
//       https://open.coros.com/oauth2/authorize
//   - The TOKEN endpoint is NOT public — it lives in COROS's private API
//     Reference Guide. We therefore do NOT hardcode a guessed URL: it is read
//     from COROS_TOKEN_URL, defaulting to the conventional path below but
//     treated as TO-CONFIRM. Override it in env once COROS confirms.
//   - COROS does NOT use OAuth scopes; access is gated by approved "API
//     functions". So the connect flow sends NO scope param.

export const COROS_ENDPOINTS = {
  // Public + confirmed live.
  authorize: 'https://open.coros.com/oauth2/authorize',
  // TO-CONFIRM (private docs). Overridable via COROS_TOKEN_URL.
  token: 'https://open.coros.com/oauth2/token',
} as const;

export type CorosConfig = {
  clientId: string;
  clientSecret: string;
  authorizeEndpoint: string;
  tokenEndpoint: string;
  callbackUrl: string;
  // Optional shared secret used to verify inbound webhook signatures. When
  // unset, the webhook accepts unsigned requests (acceptable for the COROS
  // "Service Status Check URL" and during pre-approval bring-up).
  webhookSecret?: string;
};

export type CorosConfigResult =
  | { ok: true; config: CorosConfig }
  | { ok: false; missing: string[] };

export function loadCorosConfig(): CorosConfigResult {
  const clientId = process.env.COROS_CLIENT_ID;
  const clientSecret = process.env.COROS_CLIENT_SECRET;
  const callbackUrl = process.env.COROS_OAUTH_CALLBACK_URL;
  const webhookSecret = process.env.COROS_WEBHOOK_SECRET;

  const missing: string[] = [];
  if (!clientId) missing.push('COROS_CLIENT_ID');
  if (!clientSecret) missing.push('COROS_CLIENT_SECRET');
  if (!callbackUrl) missing.push('COROS_OAUTH_CALLBACK_URL');
  if (missing.length > 0) return { ok: false, missing };

  return {
    ok: true,
    config: {
      clientId: clientId!,
      clientSecret: clientSecret!,
      authorizeEndpoint: COROS_ENDPOINTS.authorize,
      // COROS_TOKEN_URL is optional; default to the conventional path but treat
      // it as TO-CONFIRM (see file header).
      tokenEndpoint: process.env.COROS_TOKEN_URL || COROS_ENDPOINTS.token,
      callbackUrl: callbackUrl!,
      webhookSecret: webhookSecret && webhookSecret.length > 0 ? webhookSecret : undefined,
    },
  };
}

export function corosGatedResponse(missing: string[]): Response {
  return new Response(
    JSON.stringify({
      error: 'coros_not_configured',
      message:
        'COROS Open API integration is gated on developer-program approval. Required env vars are missing.',
      missing_env: missing,
      docs: '/docs/coros_oauth.md',
    }),
    { status: 503, headers: { 'content-type': 'application/json' } },
  );
}
