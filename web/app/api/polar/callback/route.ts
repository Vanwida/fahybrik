// GET /api/polar/callback?code=...&state=...
//
// Handles the Polar AccessLink OAuth 2.0 authorization-code callback. Verifies
// the CSRF state cookie to recover which athlete started the flow, exchanges the
// code for tokens (Polar requires HTTP Basic client auth → basicAuth:true),
// captures the Polar user id when present, and persists the connection
// (encrypted at rest) into wearable_connections via the provider-agnostic store.
//
// The athlete lands here in Safari on their phone (top-level redirect from
// Polar), so every terminal response is a minimal HUMAN HTML page in Spanish
// (dark + brand-orange, inline, no dependencies) — never raw JSON. The
// verification/storage logic is unchanged; only the final response shape is HTML.

import { loadPolarConfig } from '@/lib/polar/config';
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

const POLAR_PROVIDER: WearableProvider = 'polar';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // Polar surfaces user-denial / provider errors as ?error=... — surface it
  // rather than treating a missing code as our own bug.
  const providerError = url.searchParams.get('error');
  if (providerError) {
    const description = url.searchParams.get('error_description') ?? undefined;
    return errorPage(400, description ?? 'No se completó la autorización con Polar.');
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code) {
    return errorPage(400, 'Falta el código de autorización de Polar.');
  }

  const cfg = loadPolarConfig();
  if (!cfg.ok) {
    return errorPage(503, 'La conexión con Polar no está disponible ahora mismo.');
  }

  if (!isCryptoConfigured()) {
    return errorPage(503, 'La conexión con Polar no está disponible ahora mismo.');
  }

  const secure = isSecureRequest(request, url);

  // Recover + validate the athlete via the encrypted state cookie set by
  // /api/polar/connect. A missing / expired / mismatched-nonce cookie is a CSRF
  // or replayed-callback signal → abort.
  const recovered = readStateCookie({
    provider: POLAR_PROVIDER,
    cookieHeader: request.headers.get('cookie'),
    state: state ?? '',
  });
  if (!recovered) {
    return errorPage(401, 'La sesión de conexión caducó. Vuelve a intentarlo desde la app.');
  }
  const athlete_id = recovered.athlete_id;

  // Exchange the authorization code for tokens. Polar's token endpoint requires
  // HTTP Basic client auth (base64(clientId:clientSecret)) → basicAuth:true. Any
  // failure (non-2xx, unreachable, timeout, bad body — OAuth2Error or otherwise)
  // maps to a single generic error page; we never leak the provider's internals.
  let tokens;
  try {
    tokens = await exchangeCodeForTokens({
      tokenEndpoint: cfg.config.tokenEndpoint,
      clientId: cfg.config.clientId,
      clientSecret: cfg.config.clientSecret,
      code,
      redirectUri: cfg.config.callbackUrl,
      basicAuth: true,
    });
  } catch {
    return errorPage(502, 'No se pudo completar la conexión con Polar. Vuelve a intentarlo.');
  }

  // v4 needs no user registration and the cron poller resolves athletes by
  // athlete_id (not by a provider user id), so we persist just the tokens. We
  // still capture the token's user id when present — handy for support/debugging
  // — but nothing downstream requires it.
  const provider_user_id = extractProviderUserId(tokens.raw);

  const tokenSet: WearableTokenSet = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    expires_at: tokens.expires_in != null ? new Date(Date.now() + tokens.expires_in * 1000) : null,
    // Persist the scopes Polar echoes (falls back to what we requested if unset).
    scopes: tokens.scope ?? cfg.config.scopes,
  };

  // Persistence can fail for real (e.g. the athlete_id from the token belongs to
  // ANOTHER deployment's database — the two-project split bit here once, as an FK
  // violation). An unhandled throw becomes a bodyless 500 that Safari renders as a
  // "Zero KB" download — so every failure must land on the human error page.
  try {
    await saveWearableConnection({
      athlete_id,
      provider: POLAR_PROVIDER,
      provider_user_id,
      tokens: tokenSet,
    });
  } catch {
    return errorPage(500, 'No pudimos guardar la conexión. Vuelve a intentarlo desde la app.');
  }

  // Burn the transient state cookie now that the exchange succeeded.
  return successPage(clearStateCookie(POLAR_PROVIDER, secure));
}

// Polar's user-id field key varies (x_user_id / user_id / polar-user-id /
// x-user-id); probe the common variants without hardcoding a single assumption.
// Returns null when none is present.
function extractProviderUserId(raw: Record<string, unknown>): string | null {
  for (const key of ['x_user_id', 'user_id', 'polar-user-id', 'x-user-id', 'userId', 'polarUserId']) {
    const v = raw[key];
    if (typeof v === 'string' && v.length > 0) return v;
    if (typeof v === 'number') return String(v);
  }
  return null;
}

// Secure when the request is HTTPS. Behind a proxy (Vercel) the inbound URL may
// be http while the public URL is https, so honor x-forwarded-proto too.
function isSecureRequest(request: Request, url: URL): boolean {
  if (url.protocol === 'https:') return true;
  const fwd = request.headers.get('x-forwarded-proto');
  return fwd != null && fwd.split(',')[0].trim() === 'https';
}

// ---- Human HTML result pages (dark + brand orange, inline, no dependencies) ----

const BRAND = {
  bg: '#0A0A0A',
  fg: '#F5F5F5',
  muted: '#A1A1A1',
  accent: '#F06A2A',
  danger: '#F23F3F',
} as const;

function successPage(setCookie: string): Response {
  return resultPage({
    status: 200,
    ok: true,
    title: 'Cuenta Polar conectada',
    message: 'Ya puedes volver a la app.',
    setCookie,
  });
}

function errorPage(status: number, message: string): Response {
  return resultPage({ status, ok: false, title: 'No se pudo conectar Polar', message });
}

function resultPage(params: {
  status: number;
  ok: boolean;
  title: string;
  message: string;
  setCookie?: string;
}): Response {
  const iconColor = params.ok ? BRAND.accent : BRAND.danger;
  const iconTint = params.ok ? 'rgba(240,106,42,0.12)' : 'rgba(242,63,63,0.12)';
  const icon = params.ok ? '&#10003;' : '&#10005;'; // ✓ / ✕
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(params.title)}</title>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:${BRAND.bg};color:${BRAND.fg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<main style="max-width:340px;width:100%;text-align:center;">
<div style="width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;background:${iconTint};border:1px solid ${iconColor};color:${iconColor};font-size:28px;line-height:1;">${icon}</div>
<h1 style="margin:0 0 10px;font-size:20px;font-weight:700;letter-spacing:-0.01em;">${escapeHtml(params.title)}</h1>
<p style="margin:0;font-size:15px;line-height:1.5;color:${BRAND.muted};">${escapeHtml(params.message)}</p>
</main>
</body>
</html>`;
  const headers: Record<string, string> = { 'content-type': 'text/html; charset=utf-8' };
  if (params.setCookie) headers['set-cookie'] = params.setCookie;
  return new Response(html, { status: params.status, headers });
}

// Escape provider-controlled text (e.g. error_description) before it lands in HTML.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
