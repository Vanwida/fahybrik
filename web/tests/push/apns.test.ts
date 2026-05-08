import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadApnsConfig } from '@/lib/push/apns';

describe('loadApnsConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reports missing env vars when none set', () => {
    vi.stubEnv('APNS_TEAM_ID', '');
    vi.stubEnv('APNS_KEY_ID', '');
    vi.stubEnv('APNS_PRIVATE_KEY', '');
    vi.stubEnv('APNS_BUNDLE_ID', '');
    const r = loadApnsConfig();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missing).toContain('APNS_TEAM_ID');
      expect(r.missing).toContain('APNS_KEY_ID');
      expect(r.missing).toContain('APNS_PRIVATE_KEY');
      expect(r.missing).toContain('APNS_BUNDLE_ID');
    }
  });

  it('returns config when all env vars set', () => {
    vi.stubEnv('APNS_TEAM_ID', 'TEAMID1234');
    vi.stubEnv('APNS_KEY_ID', 'KEYID12345');
    vi.stubEnv('APNS_PRIVATE_KEY', '-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----');
    vi.stubEnv('APNS_BUNDLE_ID', 'pro.fahybrik.app');
    const r = loadApnsConfig();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.team_id).toBe('TEAMID1234');
      expect(r.config.bundle_id).toBe('pro.fahybrik.app');
      // Encoded \n should be decoded back to real newlines.
      expect(r.config.private_key_pem).toContain('\n');
    }
  });
});
