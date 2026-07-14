// POST /api/athlete/wearables/polar/connect-url  (athlete bearer)
//
// Returns the URL the app should open in the browser to begin the Polar OAuth
// flow. The athlete_id is taken from the BEARER — never from the body — and
// baked into a short-lived signed token (lib/wearables/connect-token), so the
// unauthenticated GET /api/polar/connect can trust WHOSE account is being linked
// without exposing a raw, forgeable athlete_id.
//
//   200 { "url": "<origin>/api/polar/connect?token=..." }
//   401 unauthorized              — no / invalid athlete bearer
//   503 { "error": "polar_not_configured" } — Polar env vars missing
//   503 encryption_not_configured — ENCRYPTION_KEY missing (cannot mint the token)

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { loadPolarConfig, polarGatedResponse } from '@/lib/polar/config';
import { isCryptoConfigured } from '@/lib/crypto/aes-gcm';
import { mintConnectToken } from '@/lib/wearables/connect-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const POLAR_PROVIDER = 'polar' as const;

export async function POST(req: Request) {
  const session = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!session) {
    return jsonError('unauthorized', 'Athlete bearer required', 401);
  }

  const cfg = loadPolarConfig();
  if (!cfg.ok) return polarGatedResponse(cfg.missing);

  // Minting the token needs ENCRYPTION_KEY — same crypto the connect route
  // requires for its state cookie. Fail cleanly with 503 rather than a 500.
  if (!isCryptoConfigured()) {
    return jsonError(
      'encryption_not_configured',
      'ENCRYPTION_KEY env var is required to begin the Polar OAuth flow.',
      503,
    );
  }

  const token = mintConnectToken({ athlete_id: session.athlete_id, provider: POLAR_PROVIDER });
  const url = new URL('/api/polar/connect', requestOrigin(req));
  url.searchParams.set('token', token);

  return jsonOk({ url: url.toString() });
}

// Public origin of the request. Behind Vercel the inbound URL is http on an
// internal host, so honor x-forwarded-proto / x-forwarded-host first (same
// forwarded-header basis as /api/polar/connect's secure check).
function requestOrigin(req: Request): string {
  const url = new URL(req.url);
  const proto = firstForwarded(req, 'x-forwarded-proto') ?? url.protocol.replace(':', '');
  const host = firstForwarded(req, 'x-forwarded-host') ?? req.headers.get('host') ?? url.host;
  return `${proto}://${host}`;
}

function firstForwarded(req: Request, header: string): string | null {
  const raw = req.headers.get(header);
  if (!raw) return null;
  const first = raw.split(',')[0]?.trim();
  return first && first.length > 0 ? first : null;
}
