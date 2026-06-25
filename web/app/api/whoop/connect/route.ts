// GET /api/whoop/connect?athlete_id=<id>
//
// Initiates the WHOOP OAuth 2.0 authorization-code flow. On success, redirects
// the browser to WHOOP's authorize page with an encrypted state cookie set; on
// missing credentials (gating) returns 503. Mirrors /api/garmin/connect.

import { loadWhoopConfig, whoopGatedResponse } from '@/lib/whoop/config';
import { buildAuthorizeUrl } from '@/lib/oauth/oauth2';
import { buildStateCookie } from '@/lib/oauth/state';
import { isCryptoConfigured } from '@/lib/crypto/aes-gcm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const athlete_id_raw = url.searchParams.get('athlete_id');
  if (!athlete_id_raw || !/^\d+$/.test(athlete_id_raw)) {
    return jsonError(400, 'invalid_athlete_id', 'athlete_id query param is required and must be numeric');
  }
  const athlete_id = BigInt(athlete_id_raw);

  const cfg = loadWhoopConfig();
  if (!cfg.ok) return whoopGatedResponse(cfg.missing);

  // The state nonce is carried in an encrypted cookie, so ENCRYPTION_KEY must be
  // set before we begin the flow (the callback reads it back to verify CSRF and
  // recover the athlete).
  if (!isCryptoConfigured()) {
    return jsonError(
      503,
      'encryption_not_configured',
      'ENCRYPTION_KEY env var is required to begin the WHOOP OAuth flow. See /docs/whoop_oauth.md.',
    );
  }

  const secure = url.protocol === 'https:';

  // buildStateCookie generates a 32-hex-char nonce (>= WHOOP's 8-char minimum)
  // and binds it to this athlete + provider; the callback validates the echoed
  // `state` against it before trusting the flow.
  const { cookie, state } = buildStateCookie({
    provider: 'whoop',
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

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
