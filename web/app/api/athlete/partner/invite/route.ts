import { z } from 'zod';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  assertInviterCanInvite,
  createInvitation,
  loadInviterInfo,
} from '@/lib/partner/invitations';
import { sendPartnerInvitationEmail } from '@/lib/partner/email';
import { RATE_LIMITS, rateLimitResponse, withRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

export async function POST(req: Request) {
  const session = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!session) return jsonError('unauthorized', 'Bearer token required', 401);

  // A1: cap invitations per user (anti-spam of Resend + invitee inboxes).
  const rl = await withRateLimit({
    scope: 'user',
    identifier: session.user_id.toString(),
    ...RATE_LIMITS.partnerInvite,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonError('invalid_json', 'Request body must be JSON', 400);
  }

  const parsed = inviteSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Invalid request body', 400, parsed.error.flatten());
  }

  const inviter = await loadInviterInfo(session.user_id);
  if (!inviter) {
    return jsonError('unauthorized', 'Inviter user not found', 401);
  }

  const eligibility = assertInviterCanInvite(inviter, parsed.data.email);
  if (eligibility) {
    return jsonError(eligibility.code, eligibility.message, 403);
  }

  const { invitation, resend } = await createInvitation(session.user_id, parsed.data.email);

  // createInvitation always returns the freshly-issued plaintext token (the
  // only moment it exists — it's stored hashed). Guard defensively anyway.
  if (!invitation.token) {
    return jsonError('invitation_token_unavailable', 'Could not issue invitation token', 500);
  }

  const emailResult = await sendPartnerInvitationEmail({
    to: invitation.invitee_email,
    inviter_name: inviter.full_name,
    token: invitation.token,
    expires_at: invitation.expires_at,
  });

  return jsonOk(
    {
      invitation_id: invitation.id.toString(),
      invitee_email: invitation.invitee_email,
      expires_at: invitation.expires_at.toISOString(),
      resend,
      sent: emailResult.sent,
      ...(emailResult.skipped_reason ? { email_skipped_reason: emailResult.skipped_reason } : {}),
    },
    resend ? 200 : 201,
  );
}
