// Suunto Cloud API (OAuth 2.0 + Azure APIM) endpoint config + env-gating helpers.
//
// Production credentials are gated on Suunto partner approval. Until the env vars
// are provisioned, the Suunto surface returns 503 with a clear message rather
// than a 500 — mirrors lib/polar/config.ts polarGatedResponse.
//
// GROUND TRUTH (verified against Suunto's own published docs):
//   - OAuth 2.0 Authorization Code, confidential client.
//     Authorize: https://cloudapi-oauth.suunto.com/oauth/authorize
//     Token:     https://cloudapi-oauth.suunto.com/oauth/token
//     The token endpoint takes client credentials via HTTP BASIC
//     (`curl --user <CLIENT_ID>:<CLIENT_SECRET>` in the official quick start),
//     so callers pass basicAuth:true to lib/oauth/oauth2.
//     Source: https://apizone.suunto.com/how-to-start
//   - Scope: the quick start documents exactly ONE scope, `workout`.
//   - Cloud API base: https://cloudapi.suunto.com (guides live under /v2/guides).
//   - Every Cloud API call needs TWO headers:
//       Authorization: Bearer <jwt>          ← the FAQ is explicit about "Bearer"
//       Ocp-Apim-Subscription-Key: <key>     ← the Azure APIM subscription key,
//                                              NOT needed on the OAuth requests
//     Source: https://apizone.suunto.com/faq ("Use the JWT tokens when making
//     requests to APIs on https://cloudapi.suunto.com/ with a header in the
//     following format: Authorization: Bearer <jwt token>"). Note that the
//     Guides PDF and the quick start both PRINT the bare token in their curl
//     samples; the FAQ is the more specific and more recent statement, so Bearer
//     is what we send.
//   - The subscription key is per-developer-account and is read from the API
//     Zone user profile page — it is a credential, so it lives in env only.
//
// SUUNTO_GUIDE_OWNER is not cosmetic: the Guides PDF ends the "Prepare
// Suuntoplus Guide File" section with an explicit "Important notice: owner field
// in manifest file should match your application name in OAuth settings". A
// mismatch is rejected at upload, so the value must come from the same place the
// OAuth app was registered — env, not a literal.

export const SUUNTO_ENDPOINTS = {
  authorize: 'https://cloudapi-oauth.suunto.com/oauth/authorize',
  token: 'https://cloudapi-oauth.suunto.com/oauth/token',
  // Cloud API host; the client appends /v2/guides/... (see client.ts).
  apiBase: 'https://cloudapi.suunto.com',
} as const;

// The quick start documents a single scope. Overridable via SUUNTO_SCOPES in case
// Suunto grants a partner more.
export const SUUNTO_DEFAULT_SCOPES = 'workout';

export type SuuntoConfig = {
  clientId: string;
  clientSecret: string;
  /** Azure APIM key sent as `Ocp-Apim-Subscription-Key` on every Cloud API call. */
  subscriptionKey: string;
  authorizeEndpoint: string;
  tokenEndpoint: string;
  callbackUrl: string;
  apiBase: string;
  scopes: string;
  /** Must equal the OAuth application name (see file header). */
  guideOwner: string;
};

export type SuuntoConfigResult =
  | { ok: true; config: SuuntoConfig }
  | { ok: false; missing: string[] };

export function loadSuuntoConfig(): SuuntoConfigResult {
  const clientId = process.env.SUUNTO_CLIENT_ID;
  const clientSecret = process.env.SUUNTO_CLIENT_SECRET;
  const subscriptionKey = process.env.SUUNTO_SUBSCRIPTION_KEY;
  const callbackUrl = process.env.SUUNTO_OAUTH_CALLBACK_URL;
  const guideOwner = process.env.SUUNTO_GUIDE_OWNER;

  const missing: string[] = [];
  if (!clientId) missing.push('SUUNTO_CLIENT_ID');
  if (!clientSecret) missing.push('SUUNTO_CLIENT_SECRET');
  if (!subscriptionKey) missing.push('SUUNTO_SUBSCRIPTION_KEY');
  if (!callbackUrl) missing.push('SUUNTO_OAUTH_CALLBACK_URL');
  if (!guideOwner) missing.push('SUUNTO_GUIDE_OWNER');
  if (missing.length > 0) return { ok: false, missing };

  return {
    ok: true,
    config: {
      clientId: clientId!,
      clientSecret: clientSecret!,
      subscriptionKey: subscriptionKey!,
      authorizeEndpoint: process.env.SUUNTO_AUTHORIZE_URL || SUUNTO_ENDPOINTS.authorize,
      tokenEndpoint: process.env.SUUNTO_TOKEN_URL || SUUNTO_ENDPOINTS.token,
      callbackUrl: callbackUrl!,
      apiBase: process.env.SUUNTO_API_BASE || SUUNTO_ENDPOINTS.apiBase,
      scopes: process.env.SUUNTO_SCOPES || SUUNTO_DEFAULT_SCOPES,
      guideOwner: guideOwner!,
    },
  };
}

export function suuntoGatedResponse(missing: string[]): Response {
  return new Response(
    JSON.stringify({
      error: 'suunto_not_configured',
      message:
        'Suunto Cloud API integration is gated on partner-program approval. Required env vars are missing.',
      missing_env: missing,
      docs: '/docs/suunto_guides.md',
    }),
    { status: 503, headers: { 'content-type': 'application/json' } },
  );
}
