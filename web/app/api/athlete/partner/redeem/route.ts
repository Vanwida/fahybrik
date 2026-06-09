import { z } from 'zod';
import { verifyAppleIdToken } from '@/lib/auth/apple';
import { AUTH_CONFIG } from '@/lib/auth/config';
import { audiences, issueSession } from '@/lib/auth/session';
import { sql } from '@/lib/db';
import { getClientIp, jsonError, jsonOk } from '@/lib/api/responses';
import { RATE_LIMITS, rateLimitResponse, withRateLimit } from '@/lib/security/rate-limit';
import {
  getInvitationByToken,
  redeemInvitation,
  type PartnerInvitationRow,
} from '@/lib/partner/invitations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const redeemSchema = z.object({
  token: z.string().min(10).max(200),
  apple_identity_token: z.string().min(20),
  nonce: z.string().min(1).max(256).optional(),
  full_name: z.string().min(1).max(200).optional(),
});

interface CreatedUser {
  user_id: bigint;
  athlete_id: bigint;
  email: string;
}

/**
 * Creates a brand-new user + athlete row from an Apple identity. Fails closed
 * if any user already exists with this apple_sub OR with this email — we do
 * NOT allow attaching an existing account to a partner invitation because it
 * would create a cross-conflict (an existing user might already have their
 * own subscription / partner / onboarding state).
 */
async function createNewPartnerUser(input: {
  apple_user_id: string;
  email: string | null;
  full_name: string | null;
}): Promise<{ ok: true; user: CreatedUser } | { ok: false; code: 'user_already_exists' }> {
  return await sql.begin(async (tx) => {
    const byApple = await tx<{ id: string }[]>`
      select id::text as id
      from users
      where apple_user_id = ${input.apple_user_id}
        and deleted_at is null
      limit 1
    `;
    if (byApple[0]) {
      return { ok: false, code: 'user_already_exists' } as const;
    }

    if (input.email) {
      const byEmail = await tx<{ id: string }[]>`
        select id::text as id
        from users
        where email = ${input.email}
          and deleted_at is null
        limit 1
      `;
      if (byEmail[0]) {
        return { ok: false, code: 'user_already_exists' } as const;
      }
    }

    const placeholderEmail =
      input.email ?? `apple-${input.apple_user_id}@privaterelay.appleid.placeholder`;
    const inserted = await tx<{ id: string; email: string }[]>`
      insert into users (email, apple_user_id, role, last_seen_at)
      values (${placeholderEmail}, ${input.apple_user_id}, 'athlete', now())
      returning id::text as id, email
    `;
    const userRow = inserted[0];
    if (!userRow) throw new Error('partner_redeem_user_insert_failed');

    const fullName = input.full_name?.trim() || 'Athlete';
    const athleteInserted = await tx<{ id: string }[]>`
      insert into athletes (user_id, full_name)
      values (${BigInt(userRow.id)}, ${fullName})
      returning id::text as id
    `;
    const athleteRow = athleteInserted[0];
    if (!athleteRow) throw new Error('partner_redeem_athlete_insert_failed');

    return {
      ok: true,
      user: {
        user_id: BigInt(userRow.id),
        athlete_id: BigInt(athleteRow.id),
        email: userRow.email,
      },
    } as const;
  });
}

function isInvitationLive(invitation: PartnerInvitationRow): boolean {
  return invitation.status === 'pending' && invitation.expires_at.getTime() > Date.now();
}

export async function POST(req: Request) {
  // A1: throttle redeem per IP — the token is the only secret, so cap guesses.
  const rl = await withRateLimit({
    scope: 'ip',
    identifier: getClientIp(req) ?? 'unknown',
    ...RATE_LIMITS.partnerRedeem,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonError('invalid_json', 'Request body must be JSON', 400);
  }

  const parsed = redeemSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Invalid request body', 400, parsed.error.flatten());
  }

  // Pre-check invitation before doing Apple verification work.
  const invitation = await getInvitationByToken(parsed.data.token);
  if (!invitation) {
    return jsonError('token_invalid', 'Invitation not found', 404);
  }
  if (!isInvitationLive(invitation)) {
    const code = invitation.status === 'accepted'
      ? 'token_already_used'
      : invitation.status === 'cancelled'
        ? 'token_cancelled'
        : 'token_expired';
    return jsonError(code, `Invitation is ${invitation.status === 'pending' ? 'expired' : invitation.status}`, 410);
  }

  let identity;
  try {
    identity = await verifyAppleIdToken({
      id_token: parsed.data.apple_identity_token,
      ...(parsed.data.nonce !== undefined ? { expected_nonce: parsed.data.nonce } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'apple_token_invalid';
    return jsonError('apple_token_invalid', message, 401);
  }

  const created = await createNewPartnerUser({
    apple_user_id: identity.apple_user_id,
    email: identity.email,
    full_name: parsed.data.full_name ?? null,
  });
  if (!created.ok) {
    return jsonError(
      'user_already_exists',
      'An account already exists for this Apple ID or email — partner linking is only available for brand-new accounts',
      409,
    );
  }

  const redemption = await redeemInvitation(parsed.data.token, created.user.user_id);
  if (!redemption.ok) {
    // Note: if redemption fails after user creation (race), the new user
    // will be left dangling without a partner — acceptable for beta. The
    // user can be cleaned up by ops if needed.
    const httpStatus = redemption.error.code === 'token_expired'
      || redemption.error.code === 'token_cancelled'
      || redemption.error.code === 'token_already_used'
      ? 410
      : redemption.error.code === 'token_invalid'
        ? 404
        : 409;
    return jsonError(redemption.error.code, redemption.error.message, httpStatus);
  }

  const userAgent = req.headers.get('user-agent');
  const ip = getClientIp(req);
  const session = await issueSession({
    user_id: created.user.user_id,
    audience: audiences.athlete,
    ttl_seconds: AUTH_CONFIG.athleteSessionTtlSeconds,
    user_agent: userAgent,
    ip,
  });

  return jsonOk({
    user_id: created.user.user_id.toString(),
    athlete_id: created.user.athlete_id.toString(),
    partner_user_id: redemption.result.inviter_user_id.toString(),
    session_token: session.token,
    expires_at: session.expires_at.toISOString(),
    email: created.user.email,
    is_private_email: identity.is_private_email,
    onboarded_at: null,
  });
}
