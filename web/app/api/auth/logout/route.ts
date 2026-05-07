import { extractBearerToken } from '@/lib/auth/athlete-session';
import { clearCoachSession } from '@/lib/auth/coach-session';
import { audiences, revokeSession, verifySession } from '@/lib/auth/session';
import { jsonOk } from '@/lib/api/responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const bearer = extractBearerToken(req.headers.get('authorization'));
  if (bearer) {
    const verified = await verifySession(bearer, audiences.athlete);
    if (verified) {
      await revokeSession(verified.jti);
    }
  }

  await clearCoachSession();

  return jsonOk({ ok: true });
}
