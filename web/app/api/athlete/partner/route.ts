import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { loadPartner } from '@/lib/partner/invitations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!session) return jsonError('unauthorized', 'Bearer token required', 401);

  const partner = await loadPartner(session.user_id);
  if (!partner) {
    return jsonOk({ partner: null }, 404);
  }

  return jsonOk({
    partner: {
      user_id: partner.user_id.toString(),
      athlete_id: partner.athlete_id?.toString() ?? null,
      full_name: partner.full_name,
      email: partner.email,
      modality: partner.modality,
      onboarded_at: partner.onboarded_at?.toISOString() ?? null,
    },
  });
}
