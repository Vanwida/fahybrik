// Generic OAuth 2.0 Authorization-Code engine (RFC 6749). NO provider specifics
// are hardcoded here — every endpoint, client id/secret, scope and redirect URI
// is passed in by the caller. COROS and WHOOP both speak standard OAuth2
// authorization-code, so this one engine serves them (and any future OAuth2
// wearable); only the per-provider config differs.
//
// Public surface:
//   - buildAuthorizeUrl       (step 1: redirect the athlete to the provider)
//   - exchangeCodeForTokens   (step 2: code -> tokens)
//   - refreshAccessToken      (rotate an expired access token)
//   - OAuth2TokenResponse / OAuth2Error
//
// Uses global fetch with an AbortController timeout. Never logs secrets.

import { Buffer } from 'node:buffer';

// Cap any single token request so a hung provider can't wedge a route.
const REQUEST_TIMEOUT_MS = 15_000;

export type OAuth2TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  // Full parsed body, for provider-specific fields (e.g. a user id) the caller
  // may need without us hardcoding them.
  raw: Record<string, unknown>;
};

// Thrown on a non-2xx token response (or an unreadable/invalid body). Carries
// the HTTP status and the raw body text so callers can map to a JSON error
// without us swallowing the cause. We never put a client secret in here.
export class OAuth2Error extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = 'OAuth2Error';
    this.status = status;
    this.body = body;
  }
}

// Step 1: build the provider authorize URL. `state` is the CSRF nonce (see
// lib/oauth/state.ts). `extraParams` covers provider quirks (e.g. PKCE
// challenge, response_type overrides) without baking them in.
export function buildAuthorizeUrl(params: {
  authorizeEndpoint: string;
  clientId: string;
  redirectUri: string;
  state: string;
  scope?: string;
  extraParams?: Record<string, string>;
}): string {
  const u = new URL(params.authorizeEndpoint);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', params.clientId);
  u.searchParams.set('redirect_uri', params.redirectUri);
  u.searchParams.set('state', params.state);
  if (params.scope) u.searchParams.set('scope', params.scope);
  if (params.extraParams) {
    for (const [k, v] of Object.entries(params.extraParams)) u.searchParams.set(k, v);
  }
  return u.toString();
}

// Step 2: exchange the authorization code for tokens.
// POST application/x-www-form-urlencoded, grant_type=authorization_code.
//
// `basicAuth`: when true, the client credentials are sent via the HTTP Basic
// Authorization header (base64(clientId:clientSecret)) and OMITTED from the
// form body — required by providers like Polar (RFC 6749 §2.3.1 client_secret_basic).
// When false/absent, credentials go in the body (default — COROS/WHOOP/Amazfit).
export async function exchangeCodeForTokens(params: {
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier?: string;
  basicAuth?: boolean;
}): Promise<OAuth2TokenResponse> {
  const form: Record<string, string> = {
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
  };
  if (!params.basicAuth) {
    form.client_id = params.clientId;
    form.client_secret = params.clientSecret;
  }
  if (params.codeVerifier) form.code_verifier = params.codeVerifier;
  return postTokenRequest(params.tokenEndpoint, form, 'token exchange', {
    basicAuth: params.basicAuth,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
  });
}

// Rotate an access token. POST grant_type=refresh_token.
// `basicAuth`: same semantics as exchangeCodeForTokens (see above).
export async function refreshAccessToken(params: {
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  basicAuth?: boolean;
}): Promise<OAuth2TokenResponse> {
  const form: Record<string, string> = {
    grant_type: 'refresh_token',
    refresh_token: params.refreshToken,
  };
  if (!params.basicAuth) {
    form.client_id = params.clientId;
    form.client_secret = params.clientSecret;
  }
  return postTokenRequest(params.tokenEndpoint, form, 'token refresh', {
    basicAuth: params.basicAuth,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
  });
}

// Build the HTTP Basic Authorization header value for client_secret_basic.
function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')}`;
}

// Shared POST for both exchange and refresh. Throws OAuth2Error on non-2xx,
// unreachable endpoint, timeout, or unparseable body. Does not log secrets.
//
// `auth` carries the client credentials so we can add a Basic Authorization
// header when the provider requires client_secret_basic (auth.basicAuth=true).
async function postTokenRequest(
  tokenEndpoint: string,
  form: Record<string, string>,
  label: string,
  auth: { basicAuth?: boolean; clientId: string; clientSecret: string },
): Promise<OAuth2TokenResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json',
  };
  if (auth.basicAuth) {
    headers.authorization = basicAuthHeader(auth.clientId, auth.clientSecret);
  }

  let res: Response;
  try {
    res = await fetch(tokenEndpoint, {
      method: 'POST',
      headers,
      body: new URLSearchParams(form).toString(),
      signal: controller.signal,
    });
  } catch (e) {
    const reason = (e as Error).name === 'AbortError' ? 'timed out' : (e as Error).message;
    throw new OAuth2Error(`${label} request failed: ${reason}`, 0, '');
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new OAuth2Error(`${label} returned ${res.status}`, res.status, text);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new OAuth2Error(`${label} returned a non-JSON body`, res.status, text);
  }

  const access_token = parsed.access_token;
  if (typeof access_token !== 'string' || access_token.length === 0) {
    throw new OAuth2Error(`${label} response missing access_token`, res.status, text);
  }

  return {
    access_token,
    refresh_token: typeof parsed.refresh_token === 'string' ? parsed.refresh_token : undefined,
    expires_in: typeof parsed.expires_in === 'number' ? parsed.expires_in : undefined,
    scope: typeof parsed.scope === 'string' ? parsed.scope : undefined,
    token_type: typeof parsed.token_type === 'string' ? parsed.token_type : undefined,
    raw: parsed,
  };
}
