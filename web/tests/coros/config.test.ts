import { afterEach, describe, expect, it } from 'vitest';
import {
  loadCorosConfig,
  corosCallbackUrl,
  COROS_MCP_URL_DEFAULT,
  COROS_MCP_OAUTH,
} from '@/lib/coros/config';

const saved: Record<string, string | undefined> = {};
function setEnv(k: string, v: string | undefined) {
  if (!(k in saved)) saved[k] = process.env[k];
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
    delete saved[k];
  }
});

describe('loadCorosConfig (MCP DCR, not Partner webhook)', () => {
  it('is configured without Partner COROS_CLIENT_ID / SECRET', () => {
    setEnv('COROS_CLIENT_ID', undefined);
    setEnv('COROS_CLIENT_SECRET', undefined);
    setEnv('COROS_OAUTH_CALLBACK_URL', undefined);
    setEnv('APP_URL', undefined);
    setEnv('NEXT_PUBLIC_APP_URL', undefined);
    const cfg = loadCorosConfig();
    expect(cfg.ok).toBe(true);
    if (cfg.ok) {
      expect(cfg.config.mcpUrl).toBe(COROS_MCP_URL_DEFAULT);
      expect(cfg.config.scopes).toContain('mcp.tools');
      expect(cfg.config.authorizeEndpoint).toBe(COROS_MCP_OAUTH.authorize);
      expect(cfg.config.tokenEndpoint).toBe(COROS_MCP_OAUTH.token);
      expect(cfg.config.revokeEndpoint).toBe(COROS_MCP_OAUTH.revoke);
      expect(cfg.config.registrationEndpoint).toBe(COROS_MCP_OAUTH.register);
      expect(cfg.config.callbackUrl).toBe('https://app.fahybrid.com/api/coros/callback');
      expect(cfg.config).not.toHaveProperty('clientId');
      expect(cfg.config).not.toHaveProperty('webhookSecret');
    }
  });

  it('does not list Partner env as missing', () => {
    setEnv('COROS_CLIENT_ID', undefined);
    setEnv('COROS_CLIENT_SECRET', undefined);
    const cfg = loadCorosConfig();
    expect(cfg.ok).toBe(true);
    if (!cfg.ok) {
      expect(cfg.missing).not.toContain('COROS_CLIENT_ID');
      expect(cfg.missing).not.toContain('COROS_CLIENT_SECRET');
      expect(cfg.missing).not.toContain('COROS_WEBHOOK_SECRET');
    }
  });

  it('derives callback from APP_URL when COROS_OAUTH_CALLBACK_URL is unset', () => {
    setEnv('COROS_OAUTH_CALLBACK_URL', undefined);
    setEnv('APP_URL', 'https://preview.example.com/');
    expect(corosCallbackUrl()).toBe('https://preview.example.com/api/coros/callback');
  });
});
