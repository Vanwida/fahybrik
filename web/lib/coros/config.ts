// COROS MCP (https://mcp.coros.com/mcp) — OAuth 2.0 self-service + pull.
//
// This is NOT the Partner Open API (open.coros.com) and is NOT the Partner
// webhook path. MCP publishes OAuth metadata at
// https://mcp.coros.com/.well-known/oauth-authorization-server (regional
// redirect; measured US host is mcpus.coros.com) and a Dynamic Client
// Registration endpoint. Pico registers FAHYBRID itself — Owner-supplied
// Partner COROS_CLIENT_ID / COROS_CLIENT_SECRET are neither required nor used.
//
// `configured` is true when DCR can run (callback URL + registration endpoint),
// not when a Partner portal secret is present.
//
// Optional overrides: COROS_OAUTH_CALLBACK_URL, COROS_MCP_URL,
// COROS_AUTHORIZE_URL, COROS_TOKEN_URL, COROS_REVOKE_URL,
// COROS_REGISTRATION_URL, COROS_OAUTH_METADATA_URL.
// ENCRYPTION_KEY is only for the athlete token store (same as Polar).

export const COROS_MCP_URL_DEFAULT = 'https://mcp.coros.com/mcp';
export const COROS_MCP_SCOPES = 'openid mcp.tools offline_access';
export const COROS_FIT_DAILY_CAP = 50;
export const COROS_PROD_APP_URL = 'https://app.fahybrid.com';
export const COROS_CLIENT_NAME = 'FAHYBRID';

// Measured 2026-09-05 from GET mcp.coros.com/.well-known/oauth-authorization-server
// (issuer + endpoints on mcpus.coros.com). Used when discovery fails briefly.
export const COROS_MCP_OAUTH = {
  metadata: 'https://mcp.coros.com/.well-known/oauth-authorization-server',
  authorize: 'https://mcpus.coros.com/oauth2/authorize',
  token: 'https://mcpus.coros.com/oauth2/token',
  revoke: 'https://mcpus.coros.com/oauth2/revoke',
  register: 'https://mcpus.coros.com/connect/register',
} as const;

export type CorosConfig = {
  authorizeEndpoint: string;
  tokenEndpoint: string;
  revokeEndpoint: string;
  registrationEndpoint: string;
  metadataUrl: string;
  callbackUrl: string;
  mcpUrl: string;
  scopes: string;
};

export type CorosConfigResult =
  | { ok: true; config: CorosConfig }
  | { ok: false; missing: string[] };

function appBaseUrl(): string {
  const raw = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? COROS_PROD_APP_URL).trim();
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, '');
}

export function corosCallbackUrl(): string {
  const explicit = process.env.COROS_OAUTH_CALLBACK_URL?.trim();
  if (explicit) return explicit;
  return `${appBaseUrl()}/api/coros/callback`;
}

export function loadCorosConfig(): CorosConfigResult {
  const callbackUrl = corosCallbackUrl();
  const registrationEndpoint =
    process.env.COROS_REGISTRATION_URL?.trim() || COROS_MCP_OAUTH.register;
  const missing: string[] = [];
  if (!callbackUrl) missing.push('COROS_OAUTH_CALLBACK_URL');
  if (!registrationEndpoint) missing.push('COROS_REGISTRATION_URL');
  if (missing.length > 0) return { ok: false, missing };

  return {
    ok: true,
    config: {
      authorizeEndpoint: process.env.COROS_AUTHORIZE_URL || COROS_MCP_OAUTH.authorize,
      tokenEndpoint: process.env.COROS_TOKEN_URL || COROS_MCP_OAUTH.token,
      revokeEndpoint: process.env.COROS_REVOKE_URL || COROS_MCP_OAUTH.revoke,
      registrationEndpoint,
      metadataUrl: process.env.COROS_OAUTH_METADATA_URL || COROS_MCP_OAUTH.metadata,
      callbackUrl,
      mcpUrl: process.env.COROS_MCP_URL || COROS_MCP_URL_DEFAULT,
      scopes: process.env.COROS_SCOPES || COROS_MCP_SCOPES,
    },
  };
}

export function corosGatedResponse(missing: string[]): Response {
  return new Response(
    JSON.stringify({
      error: 'coros_not_configured',
      message:
        'COROS MCP OAuth is not ready. Dynamic Client Registration needs a callback URL and a registration endpoint. MCP is self-service — do not set Partner COROS_CLIENT_ID / COROS_CLIENT_SECRET.',
      missing_env: missing,
    }),
    { status: 503, headers: { 'content-type': 'application/json' } },
  );
}

export function corosDcrFailedResponse(message: string): Response {
  return new Response(
    JSON.stringify({
      error: 'coros_dcr_failed',
      message,
    }),
    { status: 503, headers: { 'content-type': 'application/json' } },
  );
}
