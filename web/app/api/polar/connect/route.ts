// GET /api/polar/connect?athlete_id=<id>
//
// Initiates a Polar AccessLink OAuth 2.0 authorization-code flow. On success,
// redirects the browser to Polar's authorize page with a CSRF `state` carried in
// an encrypted HttpOnly cookie; on developer-program gating (env vars missing)
// returns 503.
//
// Polar v4 uses space-separated read-only scopes (see lib/polar/config.ts).
// Mirrors /api/coros/connect route shape.

import { polarGatedResponse, loadPolarConfig } from '@/lib/polar/config';
import { buildAuthorizeUrl } from '@/lib/oauth/oauth2';
import { buildStateCookie } from '@/lib/oauth/state';
import { isCryptoConfigured } from '@/lib/crypto/aes-gcm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const POLAR_PROVIDER = 'polar' as const;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const athlete_id_raw = url.searchParams.get('athlete_id');
  if (!athlete_id_raw || !/^\d+$/.test(athlete_id_raw)) {
    return jsonError(400, 'invalid_athlete_id', 'athlete_id query param is required and must be numeric');
  }
  const athlete_id = BigInt(athlete_id_raw);

  const cfg = loadPolarConfig();
  if (!cfg.ok) return polarGatedResponse(cfg.missing);

  // We persist the CSRF state in an encrypted cookie for the callback to verify,
  // so ENCRYPTION_KEY must be set before we begin.
  if (!isCryptoConfigured()) {
    return jsonError(
      503,
      'encryption_not_configured',
      'ENCRYPTION_KEY env var is required to begin the Polar OAuth flow. See /docs/polar_setup.md.',
    );
  }

  const secure = isSecureRequest(request, url);

  // Encrypted, HttpOnly, SameSite=Lax state cookie. `state` is the CSRF nonce we
  // echo into the authorize URL and verify on the callback.
  const { cookie, state } = buildStateCookie({
    provider: POLAR_PROVIDER,
    athlete_id,
    secure,
  });

  const authorizeUrl = buildAuthorizeUrl({
    authorizeEndpoint: cfg.config.authorizeEndpoint,
    clientId: cfg.config.clientId,
    redirectUri: cfg.config.callbackUrl,
    state,
    scope: cfg.config.scopes,
  });

  return new Response(null, {
    status: 302,
    headers: { location: authorizeUrl, 'set-cookie': cookie },
  });
}

// Secure when the request is HTTPS. Behind a proxy (Vercel) the inbound URL may
// be http while the public URL is https, so honor x-forwarded-proto too.
function isSecureRequest(request: Request, url: URL): boolean {
  if (url.protocol === 'https:') return true;
  const fwd = request.headers.get('x-forwarded-proto');
  return fwd != null && fwd.split(',')[0].trim() === 'https';
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
