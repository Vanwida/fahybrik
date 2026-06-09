// K1 — Demo coach login must be OPT-IN, never on by default, and hard-blocked
// in production unless an explicit prod escape hatch is set.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCoachDemoLoginEnabled } from '@/lib/auth/demo-login';

describe('isCoachDemoLoginEnabled (K1)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is disabled when COACH_DEMO_LOGIN is unset (opt-in, not opt-out)', () => {
    vi.stubEnv('COACH_DEMO_LOGIN', '');
    expect(isCoachDemoLoginEnabled()).toBe(false);
  });

  it("is enabled only when COACH_DEMO_LOGIN === 'true' (dev)", () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('COACH_DEMO_LOGIN', 'true');
    expect(isCoachDemoLoginEnabled()).toBe(true);
  });

  it("is disabled when COACH_DEMO_LOGIN === 'false'", () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('COACH_DEMO_LOGIN', 'false');
    expect(isCoachDemoLoginEnabled()).toBe(false);
  });

  it('is disabled for any truthy-but-not-"true" value (e.g. "1")', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('COACH_DEMO_LOGIN', '1');
    expect(isCoachDemoLoginEnabled()).toBe(false);
  });

  it("is disabled in production even with COACH_DEMO_LOGIN='true' and no override", () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('COACH_DEMO_LOGIN', 'true');
    vi.stubEnv('ALLOW_DEMO_LOGIN_IN_PROD', '');
    expect(isCoachDemoLoginEnabled()).toBe(false);
  });

  it('is re-enabled in production only with the explicit prod escape hatch', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('COACH_DEMO_LOGIN', 'true');
    vi.stubEnv('ALLOW_DEMO_LOGIN_IN_PROD', 'true');
    expect(isCoachDemoLoginEnabled()).toBe(true);
  });
});
