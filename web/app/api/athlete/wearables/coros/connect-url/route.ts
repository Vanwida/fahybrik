// POST /api/athlete/wearables/coros/connect-url  (athlete bearer)
//
// Mints a short-lived signed token bound to the bearer athlete and returns the
// URL the app opens in SFSafariViewController. Never accepts a raw athlete_id.

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { loadCorosConfig, corosGatedResponse } from '@/lib/coros/config';
import { isCryptoConfigured } from '@/lib/crypto/aes-gcm';
import { mintConnectToken } from '@/lib/wearables/connect-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COROS_PROVIDER = 'coros' as const;

export async function POST(req: Request) {
  const session = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!session) {
    return jsonError('unauthorized', 'Athlete bearer required', 401);
  }

  const cfg = loadCorosConfig();
  if (!cfg.ok) return corosGatedResponse(cfg.missing);

  if (!isCryptoConfigured()) {
    return jsonError(
      'encryption_not_configured',
      'ENCRYPTION_KEY env var is required to begin the COROS OAuth flow.',
      503,
    );
  }

  const token = mintConnectToken({ athlete_id: session.athlete_id, provider: COROS_PROVIDER });
  const url = new URL('/api/coros/connect', new URL(cfg.config.callbackUrl).origin);
  url.searchParams.set('token', token);

  return jsonOk({ url: url.toString() });
}
