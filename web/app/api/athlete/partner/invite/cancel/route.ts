import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { cancelInvitation } from '@/lib/partner/invitations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/athlete/partner/invite/cancel — the INVITER withdraws their pending
// partner invitation (pending → cancelled). Idempotent: `cancelled=false` when
// there was nothing pending to cancel (already accepted/expired/declined/none).
// A redeemed pairing is never undone here — that is the unlink flow's job.
export async function POST(req: Request) {
  const session = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!session) return jsonError('unauthorized', 'Bearer token required', 401);

  const cancelled = await cancelInvitation(session.user_id);
  return jsonOk({
    cancelled: cancelled != null,
    invitee_email: cancelled?.invitee_email ?? null,
  });
}
