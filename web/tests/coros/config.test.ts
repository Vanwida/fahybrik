import { afterEach, describe, expect, it } from 'vitest';
import { loadCorosConfig, COROS_MCP_URL_DEFAULT } from '@/lib/coros/config';

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

describe('loadCorosConfig (MCP, not Partner webhook)', () => {
  it('requires client id/secret/callback and defaults the MCP URL', () => {
    setEnv('COROS_CLIENT_ID', 'id');
    setEnv('COROS_CLIENT_SECRET', 'secret');
    setEnv('COROS_OAUTH_CALLBACK_URL', 'https://app.fahybrid.com/api/coros/callback');
    const cfg = loadCorosConfig();
    expect(cfg.ok).toBe(true);
    if (cfg.ok) {
      expect(cfg.config.mcpUrl).toBe(COROS_MCP_URL_DEFAULT);
      expect(cfg.config.scopes).toContain('mcp.tools');
      expect(cfg.config).not.toHaveProperty('webhookSecret');
    }
  });

  it('does not require a Partner webhook secret', () => {
    setEnv('COROS_CLIENT_ID', undefined);
    setEnv('COROS_CLIENT_SECRET', undefined);
    setEnv('COROS_OAUTH_CALLBACK_URL', undefined);
    const cfg = loadCorosConfig();
    expect(cfg.ok).toBe(false);
    if (!cfg.ok) {
      expect(cfg.missing).toEqual(
        expect.arrayContaining(['COROS_CLIENT_ID', 'COROS_CLIENT_SECRET', 'COROS_OAUTH_CALLBACK_URL']),
      );
      expect(cfg.missing).not.toContain('COROS_WEBHOOK_SECRET');
    }
  });
});
