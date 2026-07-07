// GET /api/citas/google/connect — coach-only. Starts the one-shot Google OAuth
// consent so the coach connects a Google account whose refresh_token powers the citas
// videollamada adapter (auto Calendar event + Meet link). Builds an HMAC-signed state
// (CSRF) and 302-redirects to Google's consent screen. The registered redirect URI is
// /api/citas/google/callback.

import { getCoachSession } from '@/lib/auth/coach-session';
import { buildConsentUrl, createSignedState } from '@/lib/citas/google';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const session = await getCoachSession();
  // Not a coach → bounce to sign-in (this is a browser navigation, not an API call).
  if (!session) {
    return new Response(null, { status: 302, headers: { location: '/sign-in' } });
  }

  const state = createSignedState();
  return new Response(null, { status: 302, headers: { location: buildConsentUrl(state) } });
}
