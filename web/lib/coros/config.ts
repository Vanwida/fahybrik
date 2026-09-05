// COROS MCP (https://mcp.coros.com/mcp) — OAuth 2.0 self-service + pull.
//
// This is NOT the Partner Open API (open.coros.com) and is NOT the Partner
// webhook path. MCP publishes OAuth metadata at
// https://mcp.coros.com/.well-known/oauth-authorization-server (regional
// redirect to mcpus / mcpeu / mcpcn). Required Vercel env:
//   COROS_CLIENT_ID, COROS_CLIENT_SECRET, COROS_OAUTH_CALLBACK_URL, ENCRYPTION_KEY
// Optional overrides: COROS_MCP_URL, COROS_AUTHORIZE_URL, COROS_TOKEN_URL,
// COROS_REVOKE_URL. Partner COROS_TOKEN_URL / COROS_WEBHOOK_SECRET are ignored.

export const COROS_MCP_URL_DEFAULT = 'https://mcp.coros.com/mcp';
export const COROS_MCP_SCOPES = 'openid mcp.tools offline_access';
export const COROS_FIT_DAILY_CAP = 50;

// Fallbacks from the live well-known document (mcp.coros.com redirects by
// region). Override via env when COROS publishes a different host.
export const COROS_MCP_OAUTH = {
  authorize: 'https://mcp.coros.com/oauth2/authorize',
  token: 'https://mcp.coros.com/oauth2/token',
  revoke: 'https://mcp.coros.com/oauth2/revoke',
} as const;

export type CorosConfig = {
  clientId: string;
  clientSecret: string;
  authorizeEndpoint: string;
  tokenEndpoint: string;
  revokeEndpoint: string;
  callbackUrl: string;
  mcpUrl: string;
  scopes: string;
};

export type CorosConfigResult =
  | { ok: true; config: CorosConfig }
  | { ok: false; missing: string[] };

export function loadCorosConfig(): CorosConfigResult {
  const clientId = process.env.COROS_CLIENT_ID;
  const clientSecret = process.env.COROS_CLIENT_SECRET;
  const callbackUrl = process.env.COROS_OAUTH_CALLBACK_URL;

  const missing: string[] = [];
  if (!clientId) missing.push('COROS_CLIENT_ID');
  if (!clientSecret) missing.push('COROS_CLIENT_SECRET');
  if (!callbackUrl) missing.push('COROS_OAUTH_CALLBACK_URL');
  if (missing.length > 0) return { ok: false, missing };

  return {
    ok: true,
    config: {
      clientId: clientId!,
      clientSecret: clientSecret!,
      authorizeEndpoint: process.env.COROS_AUTHORIZE_URL || COROS_MCP_OAUTH.authorize,
      tokenEndpoint: process.env.COROS_TOKEN_URL || COROS_MCP_OAUTH.token,
      revokeEndpoint: process.env.COROS_REVOKE_URL || COROS_MCP_OAUTH.revoke,
      callbackUrl: callbackUrl!,
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
        'COROS MCP OAuth is not configured. Set COROS_CLIENT_ID, COROS_CLIENT_SECRET, COROS_OAUTH_CALLBACK_URL and ENCRYPTION_KEY. MCP is self-service — no Partner webhook.',
      missing_env: missing,
    }),
    { status: 503, headers: { 'content-type': 'application/json' } },
  );
}
