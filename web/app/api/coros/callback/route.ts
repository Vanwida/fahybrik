// GET /api/coros/callback?code=...&state=...
//
// COROS MCP OAuth callback. Safari top-level → human HTML in Spanish, like Polar.
// PKCE verifier comes from the encrypted state cookie.

import { loadCorosConfig } from '@/lib/coros/config';
import { corosUsesBasicAuth, resolveCorosRuntime } from '@/lib/coros/dcr';
import { corosErrorPage, corosSuccessPage } from '@/lib/coros/oauth-html';
import { exchangeCodeForTokens } from '@/lib/oauth/oauth2';
import { clearStateCookie, readStateCookie } from '@/lib/oauth/state';
import {
  saveWearableConnection,
  type WearableProvider,
  type WearableTokenSet,
} from '@/lib/wearables/token-store';
import { isCryptoConfigured } from '@/lib/crypto/aes-gcm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COROS_PROVIDER: WearableProvider = 'coros';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);

  const providerError = url.searchParams.get('error');
  if (providerError) {
    const description = url.searchParams.get('error_description') ?? undefined;
    return corosErrorPage(400, description ?? 'No se completó la autorización con COROS.');
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code) {
    return corosErrorPage(400, 'Falta el código de autorización de COROS.');
  }

  const gate = loadCorosConfig();
  if (!gate.ok) {
    return corosErrorPage(503, 'La conexión con COROS no está disponible ahora mismo.');
  }

  if (!isCryptoConfigured()) {
    return corosErrorPage(503, 'La conexión con COROS no está disponible ahora mismo.');
  }

  const secure = isSecureRequest(request, url);
  const recovered = readStateCookie({
    provider: COROS_PROVIDER,
    cookieHeader: request.headers.get('cookie'),
    state: state ?? '',
  });
  if (!recovered) {
    return corosErrorPage(401, 'La sesión de conexión caducó. Vuelve a intentarlo desde la app.');
  }
  const athlete_id = recovered.athlete_id;
  if (!recovered.code_verifier) {
    return corosErrorPage(401, 'La sesión de conexión caducó. Vuelve a intentarlo desde la app.');
  }

  const runtime = await resolveCorosRuntime();
  if (!runtime.ok) {
    return corosErrorPage(503, 'La conexión con COROS no está disponible ahora mismo.');
  }
  const cfg = runtime.config;

  let tokens;
  try {
    tokens = await exchangeCodeForTokens({
      tokenEndpoint: cfg.tokenEndpoint,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      code,
      redirectUri: cfg.callbackUrl,
      codeVerifier: recovered.code_verifier,
      basicAuth: corosUsesBasicAuth(cfg),
    });
  } catch {
    return corosErrorPage(502, 'No se pudo completar la conexión con COROS. Vuelve a intentarlo.');
  }

  const provider_user_id = extractProviderUserId(tokens.raw);
  const tokenSet: WearableTokenSet = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    expires_at: tokens.expires_in != null ? new Date(Date.now() + tokens.expires_in * 1000) : null,
    scopes: tokens.scope ?? cfg.scopes,
  };

  try {
    await saveWearableConnection({
      athlete_id,
      provider: COROS_PROVIDER,
      provider_user_id,
      tokens: tokenSet,
    });
  } catch {
    return corosErrorPage(500, 'No pudimos guardar la conexión. Vuelve a intentarlo desde la app.');
  }

  return corosSuccessPage(clearStateCookie(COROS_PROVIDER, secure));
}

function extractProviderUserId(raw: Record<string, unknown>): string | null {
  for (const key of ['openId', 'open_id', 'user_id', 'userId', 'userID', 'sub']) {
    const v = raw[key];
    if (typeof v === 'string' && v.length > 0) return v;
    if (typeof v === 'number') return String(v);
  }
  return null;
}

function isSecureRequest(request: Request, url: URL): boolean {
  if (url.protocol === 'https:') return true;
  const fwd = request.headers.get('x-forwarded-proto');
  return fwd != null && fwd.split(',')[0].trim() === 'https';
}
