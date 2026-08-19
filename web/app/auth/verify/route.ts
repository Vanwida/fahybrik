import { NextResponse } from 'next/server';
import { AUTH_CONFIG } from '@/lib/auth/config';
import { setCoachSessionCookie } from '@/lib/auth/coach-session';
import { consumeMagicLink, isCoachAllowlisted } from '@/lib/auth/magic-link';
import { audiences, issueSession } from '@/lib/auth/session';
import { findOrCreateCoachByEmail } from '@/lib/auth/users';
import { getClientIp } from '@/lib/api/responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function failureRedirect(reason: string): NextResponse {
  const url = new URL(`${AUTH_CONFIG.appUrl()}/auth/verify-failed`);
  url.searchParams.set('reason', reason);
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  if (!token) return failureRedirect('missing_token');

  const consumed = await consumeMagicLink(token);
  if (!consumed) return failureRedirect('invalid_or_expired');

  if (!(await isCoachAllowlisted(consumed.email))) {
    return failureRedirect('not_allowed');
  }

  const result = await findOrCreateCoachByEmail(consumed.email);

  const userAgent = req.headers.get('user-agent');
  const ip = getClientIp(req);
  const session = await issueSession({
    user_id: result.user.id,
    audience: audiences.coach,
    ttl_seconds: AUTH_CONFIG.coachSessionTtlSeconds,
    user_agent: userAgent,
    ip,
  });

  await setCoachSessionCookie({ token: session.token, expires_at: session.expires_at });

  // Coach home: /atletas (la casa del panel desde el rediseño FLEXR; /hoy sigue
  // viva como cola de triage). next-intl prefixes the locale on the redirect.
  const home = new URL('/atletas', AUTH_CONFIG.appUrl());
  return NextResponse.redirect(home);
}
