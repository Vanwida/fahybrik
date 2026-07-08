import { createHash, randomBytes } from 'node:crypto';
import { sql, type Sql, type TransactionClient } from '@/lib/db';
import { AUTH_CONFIG } from '@/lib/auth/config';

/**
 * Build the public universal-link the athlete taps to claim + download the app.
 * Single source of truth for the invite URL shape (`${appUrl}/invite/${token}`),
 * shared by the lead alta (immediate/comp send) and the post-payment webhook.
 */
export function buildAthleteInviteUrl(token: string): string {
  const base = AUTH_CONFIG.appUrl().replace(/\/$/, '');
  return `${base}/invite/${token}`;
}

/**
 * Athlete account-claim invitations (coach → athlete).
 *
 * The coach pre-provisions an athlete + its placeholder user in the dashboard.
 * This token lets the real person bind THEIR verified Apple identity onto that
 * pre-existing user — keyed on the TOKEN, not the email, so it survives Apple's
 * Hide-My-Email (the relayed address can't be matched to the coach-entered one).
 *
 * Security mirrors lib/partner/invitations.ts after M12:
 *   - Plaintext token is NEVER persisted; only its SHA-256 hash hits the DB.
 *   - Single-use (pending → redeemed), expires (14d), and the redeem path
 *     refuses to hijack an apple_user_id already bound to a different user or
 *     to re-claim a target that's already linked to another Apple identity.
 *   - Apple verification happens in the caller (lib/auth/apple.ts) BEFORE this
 *     module touches users — we only accept an already-verified apple_user_id.
 */
function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

/** Invitation lifetime. 14 days mirrors partner_invitations (0023/0035). */
const INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type AthleteInvitationStatus = 'pending' | 'redeemed' | 'expired' | 'revoked';

export interface AthleteInvitationRow {
  id: bigint;
  athlete_id: bigint;
  target_user_id: bigint;
  created_by_coach_id: bigint;
  status: AthleteInvitationStatus;
  expires_at: Date;
  redeemed_at: Date | null;
  created_at: Date;
  /** Originating lead (funnel #5 alta), or null for a direct coach add. */
  lead_id: bigint | null;
}

interface RawInvitationRow {
  id: string;
  athlete_id: string;
  target_user_id: string;
  created_by_coach_id: string;
  status: AthleteInvitationStatus;
  expires_at: Date;
  redeemed_at: Date | null;
  created_at: Date;
  lead_id: string | null;
}

// The secret (token) is intentionally NOT selectable — it lives only as the
// SHA-256 hash in token_sha256 and is never read back.
const INVITATION_COLUMNS = `
  id::text as id,
  athlete_id::text as athlete_id,
  target_user_id::text as target_user_id,
  created_by_coach_id::text as created_by_coach_id,
  status,
  expires_at,
  redeemed_at,
  created_at,
  lead_id::text as lead_id
`;

function rowToInvitation(r: RawInvitationRow): AthleteInvitationRow {
  return {
    id: BigInt(r.id),
    athlete_id: BigInt(r.athlete_id),
    target_user_id: BigInt(r.target_user_id),
    created_by_coach_id: BigInt(r.created_by_coach_id),
    status: r.status,
    expires_at: r.expires_at,
    redeemed_at: r.redeemed_at,
    created_at: r.created_at,
    lead_id: r.lead_id ? BigInt(r.lead_id) : null,
  };
}

function defaultGenerateToken(): string {
  // 32 bytes base64url ~= 43 chars, URL-safe, plenty of entropy.
  return randomBytes(32).toString('base64url');
}

/**
 * Read-only lookup by plaintext token — mirrors
 * lib/partner/invitations.ts#getInvitationByToken. Re-hashes the candidate and
 * matches on token_sha256. Returns the row (status + expires_at) or null.
 *
 * Used by the public /invite/[token] landing page to derive its state without
 * mutating anything (no claim, no Apple identity — redeem happens later in-app).
 * The secret token is never echoed back.
 */
export async function getAthleteInvitationByToken(
  token: string,
  client: Sql = sql,
): Promise<AthleteInvitationRow | null> {
  const rows = await client<RawInvitationRow[]>`
    select ${client.unsafe(INVITATION_COLUMNS)}
    from athlete_invitations
    where token_sha256 = ${hashToken(token)}
    limit 1
  `;
  const row = rows[0];
  return row ? rowToInvitation(row) : null;
}

export interface CreateAthleteInvitationInput {
  athlete_id: bigint;
  coach_id: bigint;
  client?: Sql | TransactionClient;
  /** Originating lead (funnel #5 alta) — stamped on the invite so redeem can
   *  convert that lead. Null/omitted for a plain coach add. */
  lead_id?: bigint | null;
  /** Injectable token generator (tests). */
  generateToken?: () => string;
  /** Injectable clock (tests). */
  now?: () => number;
}

export interface CreateAthleteInvitationResult {
  invitation: AthleteInvitationRow;
  /** Plaintext token — returned ONCE here, for the deeplink. Never persisted. */
  token: string;
  expires_at: Date;
}

export interface CreateAthleteInvitationError {
  code: 'athlete_not_found' | 'athlete_not_owned' | 'athlete_already_linked';
  message: string;
}

/**
 * Create (or rotate) a pending invitation for an athlete.
 *
 * Rotation policy: if a pending invitation already exists for this athlete we
 * REVOKE it and mint a fresh one. Rationale — the plaintext of the old token is
 * gone (only its hash is stored), so we can't re-surface it; issuing a new token
 * and invalidating the previous link is the only safe "resend". One live token
 * per athlete keeps the surface minimal.
 *
 * Authorization: the athlete must exist AND belong to the requesting coach.
 * Fails closed if the athlete's user is already bound to an Apple identity
 * (nothing to claim — the account is already owned).
 */
export async function createAthleteInvitation(
  input: CreateAthleteInvitationInput,
): Promise<
  | { ok: true; result: CreateAthleteInvitationResult }
  | { ok: false; error: CreateAthleteInvitationError }
> {
  const generateToken = input.generateToken ?? defaultGenerateToken;
  const nowMs = (input.now ?? Date.now)();

  // Run on the caller's transaction when passed (keeps the lead alta atomic), else
  // open our own. `tx` is a transaction client either way — no nested begin.
  const run = async (tx: Sql | TransactionClient) => {
    // Ownership + claimability check, locking the athlete's row so a concurrent
    // create can't race past the same checks.
    const athleteRows = await tx<
      { id: string; user_id: string; coach_id: string | null; apple_user_id: string | null }[]
    >`
      select a.id::text as id,
             a.user_id::text as user_id,
             a.coach_id::text as coach_id,
             u.apple_user_id as apple_user_id
      from athletes a
      join users u on u.id = a.user_id and u.deleted_at is null
      where a.id = ${input.athlete_id}
      limit 1
      for update of a
    `;
    const athlete = athleteRows[0];
    if (!athlete) {
      return { ok: false, error: { code: 'athlete_not_found', message: 'Athlete not found' } } as const;
    }
    if (athlete.coach_id == null || BigInt(athlete.coach_id) !== input.coach_id) {
      return {
        ok: false,
        error: { code: 'athlete_not_owned', message: 'Athlete is not assigned to this coach' },
      } as const;
    }
    if (athlete.apple_user_id != null) {
      return {
        ok: false,
        error: {
          code: 'athlete_already_linked',
          message: 'This athlete account is already linked to an Apple identity',
        },
      } as const;
    }

    // Rotate: revoke any still-pending invitation for this athlete.
    await tx`
      update athlete_invitations
      set status = 'revoked'
      where athlete_id = ${input.athlete_id}
        and status = 'pending'
    `;

    const token = generateToken();
    const expiresAt = new Date(nowMs + INVITATION_TTL_MS);
    const inserted = await tx<RawInvitationRow[]>`
      insert into athlete_invitations
        (athlete_id, target_user_id, created_by_coach_id, token_sha256, status, expires_at, lead_id)
      values (
        ${input.athlete_id},
        ${BigInt(athlete.user_id)},
        ${input.coach_id},
        ${hashToken(token)},
        'pending',
        ${expiresAt},
        ${input.lead_id ?? null}
      )
      returning ${tx.unsafe(INVITATION_COLUMNS)}
    `;
    const row = inserted[0];
    if (!row) {
      throw new Error('athlete_invitation_insert_failed');
    }
    return {
      ok: true,
      result: { invitation: rowToInvitation(row), token, expires_at: expiresAt },
    } as const;
  };

  return input.client ? run(input.client) : sql.begin(run);
}

export interface RedeemAthleteInvitationInput {
  token: string;
  /** Already-verified Apple identity (the caller ran lib/auth/apple.ts). */
  apple_identity: { apple_user_id: string };
  client?: Sql;
  /** Injectable clock (tests). */
  now?: () => number;
}

export interface RedeemedAthlete {
  user_id: bigint;
  athlete_id: bigint;
  email: string;
  full_name: string;
  onboarded_at: Date | null;
}

export interface RedeemAthleteInvitationError {
  code:
    | 'token_invalid'
    | 'token_expired'
    | 'token_revoked'
    | 'invitation_already_claimed'
    | 'apple_id_already_linked';
  message: string;
}

/**
 * Redeem an athlete invitation: bind the verified apple_user_id onto the
 * invitation's target user and mark the invitation redeemed.
 *
 * Fully transactional with a row lock on the invitation (FOR UPDATE) so two
 * concurrent redeems of the same token can't both pass the status check.
 *
 * Account-takeover guards (fail closed):
 *   - apple_id_already_linked: the apple_user_id is already bound to a
 *     DIFFERENT user. Never re-point someone else's Apple identity.
 *   - invitation_already_claimed: the target user already has an apple_user_id
 *     that isn't this one (someone else, or a prior claim).
 *   - If the target already holds THIS apple_user_id, the redeem is idempotent
 *     (treated as success) — the same person re-tapping the link.
 */
export async function redeemAthleteInvitation(
  input: RedeemAthleteInvitationInput,
): Promise<
  | { ok: true; result: RedeemedAthlete }
  | { ok: false; error: RedeemAthleteInvitationError }
> {
  const client = input.client ?? sql;
  const nowMs = (input.now ?? Date.now)();
  const appleUserId = input.apple_identity.apple_user_id;

  return await client.begin(async (tx) => {
    const invRows = await tx<RawInvitationRow[]>`
      select ${tx.unsafe(INVITATION_COLUMNS)}
      from athlete_invitations
      where token_sha256 = ${hashToken(input.token)}
      limit 1
      for update
    `;
    const raw = invRows[0];
    if (!raw) {
      return { ok: false, error: { code: 'token_invalid', message: 'Invitation not found' } } as const;
    }
    const invitation = rowToInvitation(raw);

    if (invitation.status === 'revoked') {
      return { ok: false, error: { code: 'token_revoked', message: 'Invitation was revoked' } } as const;
    }
    if (invitation.status === 'redeemed') {
      return {
        ok: false,
        error: { code: 'invitation_already_claimed', message: 'Invitation was already redeemed' },
      } as const;
    }
    if (invitation.status === 'expired' || invitation.expires_at.getTime() <= nowMs) {
      // Mark expired so the status reflects reality on next read.
      if (invitation.status !== 'expired') {
        await tx`update athlete_invitations set status = 'expired' where id = ${invitation.id}`;
      }
      return { ok: false, error: { code: 'token_expired', message: 'Invitation has expired' } } as const;
    }

    // Is this apple_user_id already bound to a user?
    const appleRows = await tx<{ id: string }[]>`
      select id::text as id
      from users
      where apple_user_id = ${appleUserId}
        and deleted_at is null
      limit 1
    `;
    const appleOwner = appleRows[0];
    if (appleOwner && BigInt(appleOwner.id) !== invitation.target_user_id) {
      // Bound to someone ELSE — never hijack.
      return {
        ok: false,
        error: {
          code: 'apple_id_already_linked',
          message: 'This Apple ID is already linked to another account',
        },
      } as const;
    }

    // Inspect the target user's current Apple binding.
    const targetRows = await tx<
      { id: string; email: string; apple_user_id: string | null }[]
    >`
      select id::text as id, email, apple_user_id
      from users
      where id = ${invitation.target_user_id}
        and deleted_at is null
      limit 1
    `;
    const target = targetRows[0];
    if (!target) {
      // Target user vanished (deleted). Treat the token as invalid.
      return { ok: false, error: { code: 'token_invalid', message: 'Invitation target no longer exists' } } as const;
    }
    if (target.apple_user_id != null && target.apple_user_id !== appleUserId) {
      return {
        ok: false,
        error: {
          code: 'invitation_already_claimed',
          message: 'This invitation was already claimed by a different Apple identity',
        },
      } as const;
    }

    // Bind apple_user_id onto the target user (idempotent if already this id).
    await tx`
      update users
      set apple_user_id = ${appleUserId},
          last_seen_at = now()
      where id = ${invitation.target_user_id}
    `;

    await tx`
      update athlete_invitations
      set status = 'redeemed', redeemed_at = now()
      where id = ${invitation.id}
    `;

    // Grant REAL, persisted access. The invite-only gate is server-side: an
    // athlete has access iff they have an active `subscriptions` row. Redeeming
    // a coach invitation mints a comp subscription (source='comp', no billing),
    // exactly like createCompAthlete — so the athlete survives an app restart
    // instead of being locked back out by /api/athlete/subscription. Only
    // insert if no active sub exists already (idempotent on re-redeem; never
    // duplicates a paying Stripe sub the athlete may already hold).
    const activeSubs = await tx<{ id: string }[]>`
      select id::text as id
      from subscriptions
      where user_id = ${invitation.target_user_id}
        and status = 'active'
      limit 1
    `;
    if (activeSubs.length === 0) {
      await tx`
        insert into subscriptions (user_id, plan_type, status, source, current_period_end)
        values (${invitation.target_user_id}, 'individual', 'active', 'comp', null)
      `;
    }

    // Funnel #5: if this invite came from a lead alta, close the loop — the lead
    // becomes `convertido` (a SYSTEM transition, forward-only, unreachable by hand)
    // and now points at the athlete it produced. Guarded so a re-redeem is a no-op.
    if (invitation.lead_id != null) {
      await tx`
        update leads
        set status = 'convertido'::lead_status,
            converted_athlete_id = ${invitation.athlete_id},
            updated_at = now()
        where id = ${invitation.lead_id} and status <> 'convertido'
      `;
    }

    const athleteRows = await tx<
      { id: string; full_name: string; onboarded_at: Date | null }[]
    >`
      select id::text as id, full_name, onboarded_at
      from athletes
      where id = ${invitation.athlete_id}
      limit 1
    `;
    const athlete = athleteRows[0];
    if (!athlete) {
      throw new Error('athlete_invitation_redeem_athlete_missing');
    }

    return {
      ok: true,
      result: {
        user_id: invitation.target_user_id,
        athlete_id: BigInt(athlete.id),
        email: target.email,
        full_name: athlete.full_name,
        onboarded_at: athlete.onboarded_at,
      },
    } as const;
  });
}
