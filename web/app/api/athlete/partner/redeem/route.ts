import { z } from 'zod';
import { verifyAppleIdToken } from '@/lib/auth/apple';
import { AUTH_CONFIG } from '@/lib/auth/config';
import { audiences, issueSession } from '@/lib/auth/session';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { sql, type TransactionClient } from '@/lib/db';
import { getClientIp, jsonError, jsonOk } from '@/lib/api/responses';
import { RATE_LIMITS, rateLimitResponse, withRateLimit } from '@/lib/security/rate-limit';
import {
  getInvitationByToken,
  redeemInvitation,
  type PartnerInvitationRow,
} from '@/lib/partner/invitations';
import { createDoublesPair } from '@/lib/dashboard/coach/doubles-pairs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// `apple_identity_token` is now OPTIONAL: an authenticated caller (Bearer
// athlete session) accepts as themselves and needs no Apple token; an
// unauthenticated caller still proves identity via Apple Sign-In. Exactly one
// of {Bearer session, apple_identity_token} must be present — enforced in POST.
const redeemSchema = z.object({
  token: z.string().min(10).max(200),
  apple_identity_token: z.string().min(20).optional(),
  nonce: z.string().min(1).max(256).optional(),
  full_name: z.string().min(1).max(200).optional(),
});

/**
 * The user who is accepting the invitation, resolved by the accept matrix
 * below. Always carries a real `athlete_id` so the training surfaces resolve.
 */
export interface AcceptingPartnerUser {
  user_id: bigint;
  athlete_id: bigint;
  email: string;
  onboarded_at: Date | null;
  /** null = atleta sin coach (tier free). La respuesta deriva has_coach de aquí. */
  coach_id: bigint | null;
  /**
   * true only when this call CREATED a brand-new user (unauthenticated +
   * Apple identity that matched no existing account). false when we linked a
   * pre-existing user (existing-Apple or Bearer path).
   */
  is_new: boolean;
}

async function findUserByApple(
  tx: TransactionClient,
  appleUserId: string,
): Promise<{ id: string; email: string } | null> {
  const rows = await tx<{ id: string; email: string }[]>`
    select id::text as id, email
    from users
    where apple_user_id = ${appleUserId}
      and deleted_at is null
    limit 1
  `;
  return rows[0] ?? null;
}

async function findUserByEmail(
  tx: TransactionClient,
  email: string,
): Promise<{ id: string; email: string } | null> {
  const rows = await tx<{ id: string; email: string }[]>`
    select id::text as id, email
    from users
    where email = ${email}
      and deleted_at is null
    limit 1
  `;
  return rows[0] ?? null;
}

/**
 * Return the athlete row for a user, creating a minimal one if a matched
 * (legacy/partially-onboarded) user somehow has none — the redeem flow must
 * always hand back an athlete_id so the Dobles training surfaces light up.
 */
async function ensureAthlete(
  tx: TransactionClient,
  userId: bigint,
  fullName: string | null,
): Promise<{ athlete_id: bigint; onboarded_at: Date | null; coach_id: bigint | null }> {
  const existing = await tx<{ id: string; onboarded_at: Date | null; coach_id: string | null }[]>`
    select id::text as id, onboarded_at, coach_id::text as coach_id
    from athletes
    where user_id = ${userId}
    limit 1
  `;
  if (existing[0]) {
    return {
      athlete_id: BigInt(existing[0].id),
      onboarded_at: existing[0].onboarded_at,
      coach_id: existing[0].coach_id == null ? null : BigInt(existing[0].coach_id),
    };
  }
  const created = await tx<{ id: string; onboarded_at: Date | null; coach_id: string | null }[]>`
    insert into athletes (user_id, full_name)
    values (${userId}, ${fullName?.trim() || 'Athlete'})
    returning id::text as id, onboarded_at, coach_id::text as coach_id
  `;
  const row = created[0];
  if (!row) throw new Error('partner_redeem_athlete_ensure_failed');
  return {
    athlete_id: BigInt(row.id),
    onboarded_at: row.onboarded_at,
    coach_id: row.coach_id == null ? null : BigInt(row.coach_id),
  };
}

/**
 * Resolve WHO is accepting from a VERIFIED Apple identity — linking an existing
 * account when one is found, otherwise creating a fresh one.
 *
 * This replaces the old create-only path that hard-409'd a known apple_user_id
 * OR email. An EXISTING FAHYBRID user can now accept a partner invitation:
 *   1) existing non-deleted user by apple_user_id → USE it (no 409)
 *   2) else existing non-deleted user by email     → USE it (no 409)
 *   3) else                                        → create user + athlete
 *
 * The subsequent `redeemInvitation` still guards `accepted_user_already_paired`
 * (an existing user who is already in a pair is rejected there), so widening
 * this from "must be new" to "existing-or-new" does not weaken the at-most-one
 * partner invariant.
 */
export async function resolveOrCreatePartnerUser(
  input: { apple_user_id: string; email: string | null; full_name: string | null },
  client = sql,
): Promise<AcceptingPartnerUser> {
  return await client.begin(async (tx) => {
    const existing =
      (await findUserByApple(tx, input.apple_user_id)) ??
      (input.email ? await findUserByEmail(tx, input.email) : null);

    if (existing) {
      const athlete = await ensureAthlete(tx, BigInt(existing.id), input.full_name);
      return {
        user_id: BigInt(existing.id),
        athlete_id: athlete.athlete_id,
        email: existing.email,
        onboarded_at: athlete.onboarded_at,
        coach_id: athlete.coach_id,
        is_new: false,
      } satisfies AcceptingPartnerUser;
    }

    // No existing account → create a brand-new user + athlete.
    const placeholderEmail =
      input.email ?? `apple-${input.apple_user_id}@privaterelay.appleid.placeholder`;
    const inserted = await tx<{ id: string; email: string }[]>`
      insert into users (email, apple_user_id, role, last_seen_at)
      values (${placeholderEmail}, ${input.apple_user_id}, 'athlete', now())
      returning id::text as id, email
    `;
    const userRow = inserted[0];
    if (!userRow) throw new Error('partner_redeem_user_insert_failed');

    const athlete = await ensureAthlete(tx, BigInt(userRow.id), input.full_name);
    return {
      user_id: BigInt(userRow.id),
      athlete_id: athlete.athlete_id,
      email: userRow.email,
      onboarded_at: athlete.onboarded_at,
      coach_id: athlete.coach_id,
      is_new: true,
    } satisfies AcceptingPartnerUser;
  });
}

/** onboarded_at + coach_id del atleta — lo que la respuesta de sesión necesita. */
async function loadAthleteSessionFacts(
  athleteId: bigint,
): Promise<{ onboarded_at: Date | null; coach_id: bigint | null }> {
  const rows = await sql<{ onboarded_at: Date | null; coach_id: string | null }[]>`
    select onboarded_at, coach_id::text as coach_id from athletes where id = ${athleteId} limit 1
  `;
  const row = rows[0];
  return {
    onboarded_at: row?.onboarded_at ?? null,
    coach_id: row?.coach_id == null ? null : BigInt(row.coach_id),
  };
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

  // Pre-check invitation before doing identity work.
  const invitation = await getInvitationByToken(parsed.data.token);
  if (!invitation) {
    return jsonError('token_invalid', 'Invitation not found', 404);
  }
  if (!isInvitationLive(invitation)) {
    const code = invitation.status === 'accepted'
      ? 'token_already_used'
      : invitation.status === 'cancelled'
        ? 'token_cancelled'
        : invitation.status === 'declined'
          ? 'token_declined'
          : 'token_expired';
    return jsonError(code, `Invitation is ${invitation.status === 'pending' ? 'expired' : invitation.status}`, 410);
  }

  // ── ACCEPT MATRIX — resolve WHO is accepting ────────────────────────────────
  //   authenticated Bearer athlete session   → link the caller (existing, auth'd)
  //   unauthenticated + Apple → existing user → link that existing user (no 409)
  //   unauthenticated + Apple → no such user  → create user + athlete, then link
  // A Bearer session WINS when both are present: the authenticated caller is the
  // source of truth for who they are, so we never trust an Apple token over it.
  const bearerSession = await getAthleteSessionFromBearer(req.headers.get('authorization'));

  let accepting: AcceptingPartnerUser;
  let isPrivateEmail: boolean | null;

  if (bearerSession) {
    const facts = await loadAthleteSessionFacts(bearerSession.athlete_id);
    accepting = {
      user_id: bearerSession.user_id,
      athlete_id: bearerSession.athlete_id,
      email: bearerSession.email,
      onboarded_at: facts.onboarded_at,
      coach_id: facts.coach_id,
      is_new: false,
    };
    // No Apple identity on the Bearer path → private-relay status is unknown.
    isPrivateEmail = null;
  } else {
    const appleToken = parsed.data.apple_identity_token;
    if (!appleToken) {
      return jsonError(
        'auth_required',
        'Provide an athlete Bearer session or apple_identity_token to accept an invitation',
        401,
      );
    }
    let identity;
    try {
      identity = await verifyAppleIdToken({
        id_token: appleToken,
        ...(parsed.data.nonce !== undefined ? { expected_nonce: parsed.data.nonce } : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'apple_token_invalid';
      return jsonError('apple_token_invalid', message, 401);
    }
    accepting = await resolveOrCreatePartnerUser({
      apple_user_id: identity.apple_user_id,
      email: identity.email,
      full_name: parsed.data.full_name ?? null,
    });
    isPrivateEmail = identity.is_private_email;
  }

  const redemption = await redeemInvitation(parsed.data.token, accepting.user_id);
  if (!redemption.ok) {
    // Note: if redemption fails after a brand-new user was created (race), the
    // new user is left dangling without a partner — acceptable for beta; ops can
    // clean it up. An existing/Bearer user is untouched on failure.
    const httpStatus = redemption.error.code === 'token_expired'
      || redemption.error.code === 'token_cancelled'
      || redemption.error.code === 'token_declined'
      || redemption.error.code === 'token_already_used'
      ? 410
      : redemption.error.code === 'token_invalid'
        ? 404
        : 409;
    return jsonError(redemption.error.code, redemption.error.message, httpStatus);
  }

  // EJE ÚNICO — auto-create the DERIVED training pair (doubles_pairs) so the
  // athlete training surfaces (which resolve the partner via doubles_pairs, NOT
  // the billing users.partner_id) light up the moment the accounts link. This is
  // best-effort and runs OUTSIDE the redeem transaction (already committed): the
  // billing partner_id link is the essential result; the training pair is
  // derived. We only form it when BOTH athletes exist and share the same non-null
  // coach. Any failure (not yet onboarded, no shared coach, already_paired, …) is
  // swallowed — it must never fail the redeem response.
  try {
    const inviterUserId = redemption.result.inviter_user_id;
    const acceptedUserId = accepting.user_id;
    const athleteRows = await sql<
      { user_id: string; athlete_id: string; coach_id: string | null }[]
    >`
      select a.user_id::text as user_id, a.id::text as athlete_id, a.coach_id::text as coach_id
      from athletes a
      where a.user_id in (${inviterUserId}, ${acceptedUserId})
    `;
    const inviter = athleteRows.find((r) => r.user_id === inviterUserId.toString());
    const accepted = athleteRows.find((r) => r.user_id === acceptedUserId.toString());
    if (
      inviter &&
      accepted &&
      inviter.coach_id != null &&
      inviter.coach_id === accepted.coach_id
    ) {
      await createDoublesPair({
        coach_id: BigInt(inviter.coach_id),
        athlete_a_id: Number(inviter.athlete_id),
        athlete_b_id: Number(accepted.athlete_id),
      });
    } else {
      console.warn(
        'partner_redeem: auto training-pair skipped (athlete missing or no shared coach)',
      );
    }
  } catch (err) {
    // DoublesPairError (already_paired / athlete_not_found / mismatch / …) or any
    // other failure. The billing link stands; the training pair is derived.
    console.warn('partner_redeem: auto training-pair failed', err);
  }

  // Mint a fresh athlete session on EVERY successful accept so the response
  // shape is uniform and the invitee can act immediately. A Bearer caller simply
  // receives a fresh token alongside the one they already hold (harmless).
  const userAgent = req.headers.get('user-agent');
  const ip = getClientIp(req);
  const session = await issueSession({
    user_id: accepting.user_id,
    audience: audiences.athlete,
    ttl_seconds: AUTH_CONFIG.athleteSessionTtlSeconds,
    user_agent: userAgent,
    ip,
  });

  return jsonOk({
    user_id: accepting.user_id.toString(),
    athlete_id: accepting.athlete_id.toString(),
    partner_user_id: redemption.result.inviter_user_id.toString(),
    session_token: session.token,
    expires_at: session.expires_at.toISOString(),
    email: accepting.email,
    is_private_email: isPrivateEmail,
    onboarded_at: accepting.onboarded_at ? accepting.onboarded_at.toISOString() : null,
    // Campo ADITIVO (los decoders instalados ignoran claves desconocidas):
    // false = atleta sin coach (tier free) → la app decide qué superficie enseña.
    has_coach: accepting.coach_id != null,
  });
}
