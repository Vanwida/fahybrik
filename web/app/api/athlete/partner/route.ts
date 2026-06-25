import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { loadPartner } from '@/lib/partner/invitations';
import { buildPartnerSnapshot } from '@/lib/athlete/partner-snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/athlete/partner — the iOS "Tu pareja" panel.
//
// Resolution order (two distinct pairing axes coexist):
//   1. doubles_pair (TRAINING pair, coach-created, 0065) — the source of truth for
//      the Dobles training panel. Returns the partner's TRAINING snapshot: today's
//      workout done/pending, this week's progress, recent sessions. `source` =
//      'doubles_pair'.
//   2. users.partner_id (BILLING/social pair, 0021) — fallback for a billing pair
//      that isn't (yet) a coach training pair. Profile-only; training fields null/
//      empty. `source` = 'billing_partner'.
//   3. neither → { partner: null }, 404.
export async function GET(req: Request) {
  const session = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!session) return jsonError('unauthorized', 'Bearer token required', 401);

  // 1. Coach-created training pair (the Dobles highlight).
  const snapshot = await buildPartnerSnapshot(session.athlete_id);
  if (snapshot) {
    return jsonOk({
      source: 'doubles_pair' as const,
      partner: {
        athlete_id: snapshot.athlete_id.toString(),
        full_name: snapshot.full_name,
        today: snapshot.today,
        week: snapshot.week,
        recent: snapshot.recent,
      },
    });
  }

  // 2. Billing/social pair fallback — profile only, no training data.
  const billingPartner = await loadPartner(session.user_id);
  if (billingPartner) {
    return jsonOk({
      source: 'billing_partner' as const,
      partner: {
        user_id: billingPartner.user_id.toString(),
        athlete_id: billingPartner.athlete_id?.toString() ?? null,
        full_name: billingPartner.full_name,
        email: billingPartner.email,
        modality: billingPartner.modality,
        onboarded_at: billingPartner.onboarded_at?.toISOString() ?? null,
        today: null,
        week: { completed: 0, total: 0 },
        recent: [],
      },
    });
  }

  // 3. No partner of either kind.
  return jsonOk({ source: null, partner: null }, 404);
}
