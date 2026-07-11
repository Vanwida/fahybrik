import { AUTH_CONFIG } from './config';
import { isCoachAllowlisted } from './magic-link';
import { setCoachSessionCookie } from './coach-session';
import { audiences, issueSession } from './session';
import { findOrCreateCoachByEmail } from './users';

const DEFAULT_DEMO_EMAIL = 'coach@demo.fahybrid.app';

/**
 * Demo sign-in (no email). OPT-IN only: disabled unless COACH_DEMO_LOGIN is
 * explicitly set to 'true'. Anything else (unset, 'false', '1', …) → disabled.
 *
 * Hard production guard: even with COACH_DEMO_LOGIN=true, the feature stays off
 * when NODE_ENV === 'production' unless ALLOW_DEMO_LOGIN_IN_PROD === 'true' is
 * also present. This prevents a stray prod env var from re-opening the coach
 * backdoor.
 */
export function isCoachDemoLoginEnabled(): boolean {
  if (process.env.COACH_DEMO_LOGIN !== 'true') {
    return false;
  }
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_DEMO_LOGIN_IN_PROD !== 'true'
  ) {
    return false;
  }
  return true;
}

export function resolveDemoCoachEmail(): string {
  const allowlist = AUTH_CONFIG.coachAllowlist();
  return allowlist[0] ?? DEFAULT_DEMO_EMAIL;
}

export async function establishCoachSession(params: {
  email: string;
  user_agent: string | null;
  ip: string | null;
}): Promise<{ email: string; full_name: string }> {
  const email = params.email.toLowerCase();
  if (!(await isCoachAllowlisted(email))) {
    throw new DemoLoginError('not_allowed');
  }

  const result = await findOrCreateCoachByEmail(email);
  const session = await issueSession({
    user_id: result.user.id,
    audience: audiences.coach,
    ttl_seconds: AUTH_CONFIG.coachSessionTtlSeconds,
    user_agent: params.user_agent,
    ip: params.ip,
  });

  await setCoachSessionCookie({ token: session.token, expires_at: session.expires_at });
  return { email: result.user.email, full_name: result.coach.full_name };
}

export class DemoLoginError extends Error {
  constructor(public readonly code: 'disabled' | 'not_allowed') {
    super(code);
    this.name = 'DemoLoginError';
  }
}
