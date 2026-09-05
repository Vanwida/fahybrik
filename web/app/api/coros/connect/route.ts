// GET /api/coros/connect?token=<connect-token>
//
// Starts COROS MCP OAuth (PKCE S256). The athlete is identified ONLY by the
// signed token from POST /api/athlete/wearables/coros/connect-url. A raw
// athlete_id query param is rejected.

import { corosDcrFailedResponse, corosGatedResponse, loadCorosConfig } from '@/lib/coros/config';
import { resolveCorosRuntime } from '@/lib/coros/dcr';
import { createPkcePair } from '@/lib/coros/pkce';
import { buildAuthorizeUrl } from '@/lib/oauth/oauth2';
import { buildStateCookie } from '@/lib/oauth/state';
import { isCryptoConfigured } from '@/lib/crypto/aes-gcm';
import { verifyConnectToken } from '@/lib/wearables/connect-token';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COROS_PROVIDER = 'coros' as const;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.searchParams.has('athlete_id') && !url.searchParams.get('token')) {
    return jsonError(400, 'invalid_token', 'token query param is required');
  }
  const token = url.searchParams.get('token');
  if (!token) {
    return jsonError(400, 'invalid_token', 'token query param is required');
  }

  const gate = loadCorosConfig();
  if (!gate.ok) return corosGatedResponse(gate.missing);

  if (!isCryptoConfigured()) {
    return jsonError(
      503,
      'encryption_not_configured',
      'ENCRYPTION_KEY env var is required to begin the COROS OAuth flow.',
    );
  }

  const verified = verifyConnectToken({ token, provider: COROS_PROVIDER });
  if (!verified.ok) {
    return jsonError(400, 'invalid_token', 'token is invalid or expired');
  }
  const athlete_id = verified.athlete_id;
  const runtime = await resolveCorosRuntime();
  if (!runtime.ok) return corosDcrFailedResponse(runtime.message);
  const cfg = runtime.config;
  const secure = isSecureRequest(request, url);
  const pkce = createPkcePair();

  const { cookie, state } = buildStateCookie({
    provider: COROS_PROVIDER,
    athlete_id,
    secure,
    code_verifier: pkce.verifier,
  });

  const authorizeUrl = buildAuthorizeUrl({
    authorizeEndpoint: cfg.authorizeEndpoint,
    clientId: cfg.clientId,
    redirectUri: cfg.callbackUrl,
    state,
    scope: cfg.scopes,
    extraParams: {
      code_challenge: pkce.challenge,
      code_challenge_method: 'S256',
    },
  });

  return new Response(null, {
    status: 302,
    headers: { location: authorizeUrl, 'set-cookie': cookie },
  });
}

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
