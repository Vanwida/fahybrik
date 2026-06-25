// GET /api/coros/connect?athlete_id=<id>
//
// Initiates a COROS OAuth 2.0 authorization-code flow. On success, redirects the
// browser to COROS's authorize page with a CSRF `state` carried in an encrypted
// HttpOnly cookie; on developer-program gating (env vars missing) returns 503.
//
// COROS does NOT use OAuth scopes (access is gated by approved API functions),
// so we send NO scope param. Mirrors /api/garmin/connect route shape.

import { corosGatedResponse, loadCorosConfig } from '@/lib/coros/config';
import { buildAuthorizeUrl } from '@/lib/oauth/oauth2';
import { buildStateCookie } from '@/lib/oauth/state';
import { isCryptoConfigured } from '@/lib/crypto/aes-gcm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COROS_PROVIDER = 'coros' as const;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const athlete_id_raw = url.searchParams.get('athlete_id');
  if (!athlete_id_raw || !/^\d+$/.test(athlete_id_raw)) {
    return jsonError(400, 'invalid_athlete_id', 'athlete_id query param is required and must be numeric');
  }
  const athlete_id = BigInt(athlete_id_raw);

  const cfg = loadCorosConfig();
  if (!cfg.ok) return corosGatedResponse(cfg.missing);

  // We persist the CSRF state in an encrypted cookie for the callback to verify,
  // so ENCRYPTION_KEY must be set before we begin.
  if (!isCryptoConfigured()) {
    return jsonError(
      503,
      'encryption_not_configured',
      'ENCRYPTION_KEY env var is required to begin the COROS OAuth flow. See /docs/coros_setup.md.',
    );
  }

  const secure = isSecureRequest(request, url);

  // Encrypted, HttpOnly, SameSite=Lax state cookie. `state` is the CSRF nonce we
  // echo into the authorize URL and verify on the callback.
  const { cookie, state } = buildStateCookie({
    provider: COROS_PROVIDER,
    athlete_id,
    secure,
  });

  const authorizeUrl = buildAuthorizeUrl({
    authorizeEndpoint: cfg.config.authorizeEndpoint,
    clientId: cfg.config.clientId,
    redirectUri: cfg.config.callbackUrl,
    state,
    // No scope: COROS gates access by approved API functions, not OAuth scopes.
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
