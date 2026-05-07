// Garmin Health API endpoint config + env-gating helpers.
//
// Production credentials are gated on partner approval (see
// /docs/garmin_partner_application.md). Until then, /api/garmin/* endpoints
// return 503 with a clear message rather than a 500.

export const GARMIN_ENDPOINTS = {
  // Garmin Connect Web Services — Activity API uses these well-known URLs.
  // Sandbox vs production share the same hosts; differentiation is per-app.
  request_token: 'https://connectapi.garmin.com/oauth-service/oauth/request_token',
  authorize: 'https://connect.garmin.com/oauthConfirm',
  access_token: 'https://connectapi.garmin.com/oauth-service/oauth/access_token',
} as const;

export type GarminConfig = {
  consumer_key: string;
  consumer_secret: string;
  callback_url: string;
};

export type GarminConfigResult =
  | { ok: true; config: GarminConfig }
  | { ok: false; missing: string[] };

export function loadGarminConfig(): GarminConfigResult {
  const consumer_key = process.env.GARMIN_CONSUMER_KEY;
  const consumer_secret = process.env.GARMIN_CONSUMER_SECRET;
  const callback_url = process.env.GARMIN_OAUTH_CALLBACK_URL;
  const missing: string[] = [];
  if (!consumer_key) missing.push('GARMIN_CONSUMER_KEY');
  if (!consumer_secret) missing.push('GARMIN_CONSUMER_SECRET');
  if (!callback_url) missing.push('GARMIN_OAUTH_CALLBACK_URL');
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    config: {
      consumer_key: consumer_key!,
      consumer_secret: consumer_secret!,
      callback_url: callback_url!,
    },
  };
}

export function gatedResponse(missing: string[]): Response {
  return new Response(
    JSON.stringify({
      error: 'garmin_not_configured',
      message:
        'Garmin Health API integration is gated on partner approval. Required env vars are missing.',
      missing_env: missing,
      docs: '/docs/garmin_oauth.md',
    }),
    { status: 503, headers: { 'content-type': 'application/json' } },
  );
}
