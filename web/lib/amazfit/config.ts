// Amazfit / Zepp (Huami Web API, a.k.a. Zepp Open Platform) OAuth 2.0 endpoint
// config + env-gating helpers.
//
// Production credentials are gated on Zepp/Huami "data cooperation" approval
// (corporate-only, manual review). Until the env vars are provisioned,
// /api/amazfit/* endpoints return 503 with a clear message rather than a 500 —
// mirrors lib/coros/config.ts corosGatedResponse.
//
// GROUND TRUTH (verified against the Huami/Zepp REST API wiki —
// github.com/huamitech/rest-api/wiki):
//   - OAuth 2.0 Authorization Code, confidential client. The wiki is explicit:
//     "Do not store your client secret in your client application. Making the
//     request from a back-end server protects your client secret." So the secret
//     lives ONLY here, server-side.
//   - Authorize endpoint (browser / native-SDK launch), confirmed:
//       https://user.huami.com/oauth/index.html
//     The authorize URL takes #/?client_id=...&redirect_uri=...&response_type=
//     code&state=... — note the SPA hash fragment in the path. We pass the base
//     URL to the shared OAuth2 engine and let it append the standard query
//     params; the live URL Huami shows users carries them after the hash.
//   - Token endpoint, confirmed:
//       https://auth.huami.com/oauth2/access_token
//     Overridable via AMAZFIT_TOKEN_URL. The wiki (auth-doc, dated 2017, lightly
//     maintained) is the only source, so we treat the default as TO-CONFIRM and
//     allow an env override — exactly how COROS_TOKEN_URL is handled.
//   - API base host (for the eventual data pull): https://api-open.huami.com,
//     under the /users/-/ namespace. Per-data-type subpaths live in api-doc.html,
//     which currently 404s, so we expose only the base here.
//   - Scopes ARE used (unlike COROS, which gates by approved functions). They are
//     SEMICOLON-separated per the wiki: profile;activity;sleep;heartrate;motion;
//     sport;sportDetail;notifyme. Default to the read scopes we actually need;
//     omit notifyme (push-to-watch notifications, not data we ingest).
//
// REGION CAVEAT: the direct API has region routing (cn-north-1 vs us-west-2);
// EU/Spain athletes map to the non-China region. The authorize/token hosts above
// are the global huami.com hosts; if Zepp issues region-specific hosts on
// onboarding, override via env. Not modeled as a separate var until confirmed.

// Default OAuth scopes (semicolon-separated, per the Huami wiki). Read-only data
// we ingest: profile + activity/sleep/heartrate + sport summary & detail. We do
// NOT request `notifyme` (push notifications to the wearable, not a data pull),
// nor `motion` (raw 1440-min/day sensor stream we have no use for yet).
const AMAZFIT_DEFAULT_SCOPES = 'profile;activity;sleep;heartrate;sport;sportDetail';

export const AMAZFIT_ENDPOINTS = {
  // Confirmed live (Zepp/Huami OAuth authorize SPA entry point).
  authorize: 'https://user.huami.com/oauth/index.html',
  // From the Huami wiki (auth-doc, 2017). Overridable via AMAZFIT_TOKEN_URL and
  // treated as TO-CONFIRM until verified on partner onboarding.
  token: 'https://auth.huami.com/oauth2/access_token',
  // API base host for the eventual data pull (per-type subpaths TO-CONFIRM).
  apiBase: 'https://api-open.huami.com',
} as const;

export type AmazfitConfig = {
  clientId: string;
  clientSecret: string;
  authorizeEndpoint: string;
  tokenEndpoint: string;
  callbackUrl: string;
  // Host for the future data pull (GET https://api-open.huami.com/users/-/...).
  apiBase: string;
  // Semicolon-separated OAuth scopes sent on the authorize redirect.
  scopes: string;
  // Optional shared secret used to verify inbound webhook signatures. Huami
  // signs webhooks RSA-SHA1 with a published public key (region-specific URL);
  // until that verification is wired, a shared secret gates the receiver. When
  // unset, the webhook accepts unsigned requests (acceptable during pre-approval
  // bring-up). Mirrors COROS_WEBHOOK_SECRET handling.
  webhookSecret?: string;
};

export type AmazfitConfigResult =
  | { ok: true; config: AmazfitConfig }
  | { ok: false; missing: string[] };

export function loadAmazfitConfig(): AmazfitConfigResult {
  const clientId = process.env.AMAZFIT_CLIENT_ID;
  const clientSecret = process.env.AMAZFIT_CLIENT_SECRET;
  const callbackUrl = process.env.AMAZFIT_OAUTH_CALLBACK_URL;
  const webhookSecret = process.env.AMAZFIT_WEBHOOK_SECRET;

  const missing: string[] = [];
  if (!clientId) missing.push('AMAZFIT_CLIENT_ID');
  if (!clientSecret) missing.push('AMAZFIT_CLIENT_SECRET');
  if (!callbackUrl) missing.push('AMAZFIT_OAUTH_CALLBACK_URL');
  if (missing.length > 0) return { ok: false, missing };

  return {
    ok: true,
    config: {
      clientId: clientId!,
      clientSecret: clientSecret!,
      // AMAZFIT_AUTHORIZE_URL is optional; default to the confirmed authorize
      // host but allow an override (e.g. a region-specific host on onboarding).
      authorizeEndpoint: process.env.AMAZFIT_AUTHORIZE_URL || AMAZFIT_ENDPOINTS.authorize,
      // AMAZFIT_TOKEN_URL is optional; default to the wiki path but treat it as
      // TO-CONFIRM (see file header).
      tokenEndpoint: process.env.AMAZFIT_TOKEN_URL || AMAZFIT_ENDPOINTS.token,
      callbackUrl: callbackUrl!,
      apiBase: AMAZFIT_ENDPOINTS.apiBase,
      scopes: process.env.AMAZFIT_SCOPES || AMAZFIT_DEFAULT_SCOPES,
      webhookSecret: webhookSecret && webhookSecret.length > 0 ? webhookSecret : undefined,
    },
  };
}

export function amazfitGatedResponse(missing: string[]): Response {
  return new Response(
    JSON.stringify({
      error: 'amazfit_not_configured',
      message:
        'Amazfit (Zepp/Huami Web API) integration is gated on data-cooperation approval (corporate-only). Required env vars are missing.',
      missing_env: missing,
      docs: '/docs/amazfit_oauth.md',
    }),
    { status: 503, headers: { 'content-type': 'application/json' } },
  );
}
