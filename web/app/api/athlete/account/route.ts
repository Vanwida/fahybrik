// DELETE /api/athlete/account
//
// RGPD Art. 17 (right to erasure) + Apple App Store Guideline 5.1.1(v)
// ("Account Deletion in App"). The athlete supplies an exact-string
// confirmation; we soft-delete + anonymize their record and schedule the
// IRREVERSIBLE hard-delete 30 days out. See lib/athlete/account-deletion.ts
// for the side-effects (invitations / subscription / partner notify / session
// revoke).
//
// Apple guideline requires the deletion path be reachable from the iOS app
// itself — this is the endpoint the Profile → Eliminar cuenta screen calls.

import { z } from 'zod';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import {
  ACCOUNT_DELETION_CONFIRMATION,
  softDeleteAccount,
} from '@/lib/athlete/account-deletion';
import { captureRouteError } from '@/lib/observability/capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  // The user must type the literal phrase. We hard-match to make accidental
  // deletion essentially impossible.
  confirmation: z.literal(ACCOUNT_DELETION_CONFIRMATION),
  // Free-form reason — stored on the deletion job for product feedback.
  reason: z.string().max(2000).optional(),
});

export async function DELETE(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) {
    return jsonError('unauthorized', 'Athlete bearer token required', 401);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(
      'invalid_confirmation',
      `Confirmation must equal exactly "${ACCOUNT_DELETION_CONFIRMATION}"`,
      400,
    );
  }

  try {
    const result = await softDeleteAccount({
      sql,
      athlete_id: auth.athlete_id,
      user_id: auth.user_id,
      reason: parsed.data.reason ?? null,
    });

    return jsonOk(
      {
        scheduled_hard_delete_at: result.scheduled_hard_delete_at,
        partner_notified: result.partner_notified,
        invitations_cancelled: result.invitations_cancelled,
        subscription_cancelled_at_period_end: result.subscription_cancelled_at_period_end,
      },
      202,
    );
  } catch (err) {
    captureRouteError(err, {
      route: 'api/athlete/account.DELETE',
      meta: { athlete_id: String(auth.athlete_id), user_id: String(auth.user_id) },
    });
    return jsonError('internal', 'Account deletion failed', 500);
  }
}
