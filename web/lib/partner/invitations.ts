import { createHash, randomBytes } from 'node:crypto';
import { sql, type Sql, type TransactionClient } from '@/lib/db';

/**
 * M12: invitation tokens are stored hashed (token_sha256), mirroring
 * magic_link_tokens. The plaintext token is generated once, returned to the
 * caller at creation (for the email/deeplink), and never persisted — only its
 * SHA-256 hash hits the DB. Lookups (redeem) re-hash the candidate and match on
 * token_sha256.
 */
function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

export interface PartnerInvitationRow {
  id: bigint;
  inviter_user_id: bigint;
  invitee_email: string;
  /**
   * Plaintext token. ONLY populated when the row was just created (so the
   * caller can email the deeplink). On every subsequent read it is `null`
   * because we no longer store the plaintext — only its hash.
   */
  token: string | null;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled' | 'declined';
  expires_at: Date;
  accepted_at: Date | null;
  accepted_user_id: bigint | null;
  created_at: Date;
}

interface RawInvitationRow {
  id: string;
  inviter_user_id: string;
  invitee_email: string;
  status: PartnerInvitationRow['status'];
  expires_at: Date;
  accepted_at: Date | null;
  accepted_user_id: string | null;
  created_at: Date;
}

function rowToInvitation(r: RawInvitationRow, tokenPlaintext: string | null = null): PartnerInvitationRow {
  return {
    id: BigInt(r.id),
    inviter_user_id: BigInt(r.inviter_user_id),
    invitee_email: r.invitee_email,
    token: tokenPlaintext,
    status: r.status,
    expires_at: r.expires_at,
    accepted_at: r.accepted_at,
    accepted_user_id: r.accepted_user_id == null ? null : BigInt(r.accepted_user_id),
    created_at: r.created_at,
  };
}

// Note: the plaintext `token` column is DEPRECATED (0032) and no longer
// selected — the secret lives only as `token_sha256`.
const INVITATION_COLUMNS = `
  id::text as id,
  inviter_user_id::text as inviter_user_id,
  invitee_email,
  status,
  expires_at,
  accepted_at,
  accepted_user_id::text as accepted_user_id,
  created_at
`;

export interface CreateInvitationResult {
  invitation: PartnerInvitationRow;
  /** true when an existing pending invitation for the same email was returned. */
  resend: boolean;
}

export interface InviterEligibilityError {
  code:
    | 'inviter_not_dobles'
    | 'inviter_already_paired'
    | 'invitee_email_invalid'
    | 'invitee_is_self';
  message: string;
}

interface CreateInvitationDeps {
  client?: Sql;
  generateToken?: () => string;
}

function defaultGenerateToken(): string {
  // 32 bytes base64url ~= 43 chars, plenty of entropy and URL-safe.
  return randomBytes(32).toString('base64url');
}

/**
 * Create a partner invitation. If one already exists for the same invitee
 * email (status=pending), returns it with `resend: true` instead of creating
 * a duplicate. Validates inviter eligibility (Dobles plan, no existing
 * partner) at the caller-layer; this function trusts the inviter is allowed
 * to invite (caller checks via {@link assertInviterCanInvite}).
 */
export async function createInvitation(
  inviterUserId: bigint,
  inviteeEmail: string,
  deps: CreateInvitationDeps = {},
): Promise<CreateInvitationResult> {
  const client = deps.client ?? sql;
  const generateToken = deps.generateToken ?? defaultGenerateToken;
  const normalizedEmail = inviteeEmail.trim().toLowerCase();

  return await client.begin(async (tx) => {
    const existingRows = await tx<RawInvitationRow[]>`
      select ${tx.unsafe(INVITATION_COLUMNS)}
      from partner_invitations
      where inviter_user_id = ${inviterUserId}
        and lower(invitee_email) = ${normalizedEmail}
        and status = 'pending'
        and expires_at > now()
      order by created_at desc
      limit 1
    `;
    const existing = existingRows[0];
    if (existing) {
      // Resend: the stored token is only a hash, so the original plaintext is
      // gone. Issue a FRESH plaintext token, rotate the stored hash to match,
      // and hand the new plaintext back so the email link works. The old hash
      // is overwritten (the previous link is invalidated — acceptable for a
      // re-invite of the same pending invitation).
      const token = generateToken();
      await tx`
        update partner_invitations
        set token_sha256 = ${hashToken(token)}
        where id = ${BigInt(existing.id)}
      `;
      return { invitation: rowToInvitation(existing, token), resend: true };
    }

    const token = generateToken();
    const inserted = await tx<RawInvitationRow[]>`
      insert into partner_invitations (inviter_user_id, invitee_email, token_sha256)
      values (${inviterUserId}, ${normalizedEmail}, ${hashToken(token)})
      returning ${tx.unsafe(INVITATION_COLUMNS)}
    `;
    const row = inserted[0];
    if (!row) {
      throw new Error('partner_invitation_insert_failed');
    }
    return { invitation: rowToInvitation(row, token), resend: false };
  });
}

export async function getInvitationByToken(
  token: string,
  client: Sql = sql,
): Promise<PartnerInvitationRow | null> {
  const rows = await client<RawInvitationRow[]>`
    select ${client.unsafe(INVITATION_COLUMNS)}
    from partner_invitations
    where token_sha256 = ${hashToken(token)}
    limit 1
  `;
  const row = rows[0];
  // Don't echo the plaintext back on a lookup — it's a secret we no longer
  // store; the caller already holds it.
  return row ? rowToInvitation(row) : null;
}

export interface InviterInfo {
  user_id: bigint;
  email: string;
  full_name: string | null;
  has_partner: boolean;
  plan_type: 'individual' | 'dobles' | 'pro_elite' | null;
}

/**
 * Load inviter info from users + athletes + subscriptions. We treat the inviter
 * as the user identified by user_id. We pull their athlete full_name (if any)
 * and their newest subscription's plan_type (if any).
 *
 * TODO(W5): once Stripe webhook is live, plan_type comes from an active
 * subscription. For now, an inviter with NO subscriptions row is allowed
 * through (beta), but we still surface plan_type=null so callers can decide.
 */
export async function loadInviterInfo(
  userId: bigint,
  client: Sql = sql,
): Promise<InviterInfo | null> {
  const rows = await client<
    {
      user_id: string;
      email: string;
      partner_id: string | null;
      full_name: string | null;
      plan_type: 'individual' | 'dobles' | 'pro_elite' | null;
    }[]
  >`
    select
      u.id::text as user_id,
      u.email,
      u.partner_id::text as partner_id,
      a.full_name,
      (
        select s.plan_type
        from subscriptions s
        where s.user_id = u.id
        order by s.created_at desc
        limit 1
      ) as plan_type
    from users u
    left join athletes a on a.user_id = u.id
    where u.id = ${userId}
      and u.deleted_at is null
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    user_id: BigInt(row.user_id),
    email: row.email,
    full_name: row.full_name,
    has_partner: row.partner_id != null,
    plan_type: row.plan_type,
  };
}

/**
 * Validate that the inviter is eligible to send a partner invitation.
 *
 * Beta-stage rule (W4, pre-Stripe):
 *  - If `plan_type` is unknown (no subscriptions row yet) → ALLOW. Stripe
 *    integration in W5 will tighten this.
 *  - If `plan_type` is explicit and != 'dobles' → REJECT.
 *  - If the inviter already has a partner linked → REJECT.
 */
export function assertInviterCanInvite(
  inviter: InviterInfo,
  inviteeEmail: string,
): InviterEligibilityError | null {
  const normalized = inviteeEmail.trim().toLowerCase();
  if (!normalized) {
    return { code: 'invitee_email_invalid', message: 'Email is required' };
  }
  if (normalized === inviter.email.toLowerCase()) {
    return { code: 'invitee_is_self', message: 'Cannot invite yourself' };
  }
  if (inviter.has_partner) {
    return {
      code: 'inviter_already_paired',
      message: 'Inviter is already paired with a partner',
    };
  }
  if (inviter.plan_type != null && inviter.plan_type !== 'dobles') {
    return {
      code: 'inviter_not_dobles',
      message: 'Partner invitations require the Dobles plan',
    };
  }
  return null;
}

export interface RedeemInvitationResult {
  invitation: PartnerInvitationRow;
  inviter_user_id: bigint;
  accepted_user_id: bigint;
}

export interface RedeemInvitationError {
  code:
    | 'token_invalid'
    | 'token_expired'
    | 'token_already_used'
    | 'token_cancelled'
    | 'token_declined'
    | 'inviter_already_paired'
    | 'accepted_user_already_paired';
  message: string;
}

interface RedeemInvitationDeps {
  client?: Sql;
}

/**
 * Set subscriptions.partner_user_id = `partnerUserId` on `userId`'s most
 * relevant subscription. "Most relevant" mirrors getSubscriptionByUserId:
 * the newest active/trialing/past_due/incomplete row (a Dobles sub may still
 * be incomplete at link time, before the webhook activates it). Only Dobles
 * subscriptions are linked — individual/pro_elite never share a partner.
 *
 * One-directional: call once per side to populate both. No-op when the user
 * has no eligible subscription yet (the Stripe webhook backfills it later).
 */
export async function setSubscriptionPartner(
  client: Sql | TransactionClient,
  userId: bigint,
  partnerUserId: bigint,
): Promise<void> {
  await client`
    update subscriptions
    set partner_user_id = ${partnerUserId}, updated_at = now()
    where id = (
      select id from subscriptions
      where user_id = ${userId}
        and plan_type = 'dobles'
      order by
        case when status in ('active', 'trialing', 'past_due', 'incomplete') then 0 else 1 end,
        created_at desc
      limit 1
    )
  `;
}

/** Populate partner_user_id on BOTH users' Dobles subscriptions, bidirectional. */
export async function linkSubscriptionPartners(
  client: Sql | TransactionClient,
  userA: bigint,
  userB: bigint,
): Promise<void> {
  await setSubscriptionPartner(client, userA, userB);
  await setSubscriptionPartner(client, userB, userA);
}

/**
 * Redeem a pending invitation: links inviter ↔ accepted user via partner_id
 * (both sides) and marks the invitation accepted.
 *
 * Callers MUST provide an already-existing `accepted_user_id` (the new user
 * created from Apple Sign-In). This function does not create users itself —
 * that's the responsibility of the redeem endpoint (which knows the Apple
 * identity flow). It DOES, however, fail closed if either side already has
 * a partner linked, to keep the invariant that partner_id is bidirectional
 * and at-most-one.
 */
export async function redeemInvitation(
  token: string,
  acceptedUserId: bigint,
  deps: RedeemInvitationDeps = {},
): Promise<{ ok: true; result: RedeemInvitationResult } | { ok: false; error: RedeemInvitationError }> {
  const client = deps.client ?? sql;

  return await client.begin(async (tx) => {
    // A2: lock the invitation row for the duration of the transaction so two
    // concurrent redeems of the same token can't both pass the status check
    // and double-link. The second request blocks here until the first commits,
    // then re-reads status='accepted' and is rejected as token_already_used.
    const invRows = await tx<RawInvitationRow[]>`
      select ${tx.unsafe(INVITATION_COLUMNS)}
      from partner_invitations
      where token_sha256 = ${hashToken(token)}
      limit 1
      for update
    `;
    const raw = invRows[0];
    if (!raw) {
      return { ok: false, error: { code: 'token_invalid', message: 'Invitation not found' } } as const;
    }
    const invitation = rowToInvitation(raw);

    if (invitation.status === 'cancelled') {
      return { ok: false, error: { code: 'token_cancelled', message: 'Invitation was cancelled' } } as const;
    }
    if (invitation.status === 'declined') {
      return { ok: false, error: { code: 'token_declined', message: 'Invitation was declined' } } as const;
    }
    if (invitation.status === 'accepted') {
      return { ok: false, error: { code: 'token_already_used', message: 'Invitation was already redeemed' } } as const;
    }
    if (invitation.status === 'expired' || invitation.expires_at.getTime() <= Date.now()) {
      return { ok: false, error: { code: 'token_expired', message: 'Invitation has expired' } } as const;
    }

    // Both users must currently have no partner.
    const partnerCheck = await tx<{ id: string; partner_id: string | null }[]>`
      select id::text as id, partner_id::text as partner_id
      from users
      where id in (${invitation.inviter_user_id}, ${acceptedUserId})
    `;
    for (const row of partnerCheck) {
      if (row.partner_id != null) {
        const isInviter = BigInt(row.id) === invitation.inviter_user_id;
        return {
          ok: false,
          error: {
            code: isInviter ? 'inviter_already_paired' : 'accepted_user_already_paired',
            message: isInviter
              ? 'Inviter is already paired with a partner'
              : 'You are already paired with a partner',
          },
        } as const;
      }
    }

    // Link both sides.
    await tx`
      update users set partner_id = ${acceptedUserId} where id = ${invitation.inviter_user_id}
    `;
    await tx`
      update users set partner_id = ${invitation.inviter_user_id} where id = ${acceptedUserId}
    `;

    // Mirror the link onto the billing model: a Dobles subscription is shared
    // by both users, tracked via subscriptions.partner_user_id. The Stripe
    // cancellation cascade (lib/partner/cascade) reads ONLY this column, so it
    // must be populated here when the pair is formed — otherwise the cascade
    // can never fire. Point each user's live subscription at the other. Safe
    // when a side has no subscription row yet (the webhook backfills it later
    // via upsertSubscription, which re-derives partner_user_id from users.partner_id).
    await linkSubscriptionPartners(tx, invitation.inviter_user_id, acceptedUserId);

    const updatedRows = await tx<RawInvitationRow[]>`
      update partner_invitations
      set status = 'accepted',
          accepted_at = now(),
          accepted_user_id = ${acceptedUserId}
      where id = ${invitation.id}
      returning ${tx.unsafe(INVITATION_COLUMNS)}
    `;
    const updatedRaw = updatedRows[0];
    if (!updatedRaw) {
      throw new Error('partner_invitation_update_failed');
    }

    return {
      ok: true,
      result: {
        invitation: rowToInvitation(updatedRaw),
        inviter_user_id: invitation.inviter_user_id,
        accepted_user_id: acceptedUserId,
      },
    } as const;
  });
}

export interface PartnerSummary {
  user_id: bigint;
  athlete_id: bigint | null;
  full_name: string | null;
  email: string;
  onboarded_at: Date | null;
  modality: 'individual' | 'dobles' | 'pro_elite' | null;
}

export async function loadPartner(
  userId: bigint,
  client: Sql = sql,
): Promise<PartnerSummary | null> {
  const rows = await client<
    {
      partner_user_id: string | null;
      partner_email: string | null;
      partner_full_name: string | null;
      partner_athlete_id: string | null;
      partner_onboarded_at: Date | null;
      partner_plan_type: 'individual' | 'dobles' | 'pro_elite' | null;
    }[]
  >`
    select
      pu.id::text as partner_user_id,
      pu.email as partner_email,
      pa.full_name as partner_full_name,
      pa.id::text as partner_athlete_id,
      pa.onboarded_at as partner_onboarded_at,
      (
        select s.plan_type
        from subscriptions s
        where s.user_id = pu.id
        order by s.created_at desc
        limit 1
      ) as partner_plan_type
    from users u
    join users pu on pu.id = u.partner_id and pu.deleted_at is null
    left join athletes pa on pa.user_id = pu.id
    where u.id = ${userId}
      and u.deleted_at is null
      and u.partner_id is not null
    limit 1
  `;
  const row = rows[0];
  if (!row || !row.partner_user_id) return null;
  return {
    user_id: BigInt(row.partner_user_id),
    athlete_id: row.partner_athlete_id ? BigInt(row.partner_athlete_id) : null,
    full_name: row.partner_full_name,
    email: row.partner_email ?? '',
    onboarded_at: row.partner_onboarded_at,
    modality: row.partner_plan_type,
  };
}

/**
 * Coach-side unlink: clears partner_id on both sides + marks any related
 * pending invitations as cancelled. Returns the previous partner pair if
 * any, for audit/logging.
 */
export async function unlinkPartner(
  userId: bigint,
  client: Sql = sql,
): Promise<{ user_id: bigint; partner_user_id: bigint } | null> {
  return await client.begin(async (tx) => {
    const rows = await tx<{ partner_id: string | null }[]>`
      select partner_id::text as partner_id
      from users
      where id = ${userId}
        and deleted_at is null
      limit 1
    `;
    const row = rows[0];
    if (!row || !row.partner_id) return null;
    const partnerUserId = BigInt(row.partner_id);

    await tx`
      update users set partner_id = null where id in (${userId}, ${partnerUserId})
    `;
    await tx`
      update partner_invitations
      set status = 'cancelled'
      where inviter_user_id in (${userId}, ${partnerUserId})
        and status = 'pending'
    `;

    return { user_id: userId, partner_user_id: partnerUserId };
  });
}

/**
 * Inviter-side cancel: flip the inviter's latest PENDING invitation to
 * 'cancelled'. Returns the cancelled row, or null when there was no pending
 * invitation to cancel (already accepted/expired/declined/none). Only the
 * inviter's own pending row is touched — a redeemed pairing is never undone
 * here (that is {@link unlinkPartner}'s job).
 */
export async function cancelInvitation(
  inviterUserId: bigint,
  client: Sql = sql,
): Promise<PartnerInvitationRow | null> {
  const rows = await client<RawInvitationRow[]>`
    update partner_invitations
    set status = 'cancelled'
    where id = (
      select id from partner_invitations
      where inviter_user_id = ${inviterUserId}
        and status = 'pending'
      order by created_at desc
      limit 1
    )
    returning ${client.unsafe(INVITATION_COLUMNS)}
  `;
  const row = rows[0];
  return row ? rowToInvitation(row) : null;
}

export interface DeclineInvitationResult {
  invitation: PartnerInvitationRow;
}

export interface DeclineInvitationError {
  code: 'token_invalid' | 'token_expired' | 'token_already_used' | 'token_cancelled';
  message: string;
}

/**
 * Invitee-side decline: flip a PENDING invitation to 'declined' by its token.
 * The token is the authorization (the invitee holds it from the deeplink), so
 * no session is required — mirrors the unauthenticated redeem path. Row is
 * locked FOR UPDATE so a concurrent redeem/decline can't race. Terminal
 * statuses are reported honestly so the caller can show the right copy;
 * declining an already-declined invitation is an idempotent success.
 */
export async function declineInvitation(
  token: string,
  deps: RedeemInvitationDeps = {},
): Promise<
  { ok: true; result: DeclineInvitationResult } | { ok: false; error: DeclineInvitationError }
> {
  const client = deps.client ?? sql;
  return await client.begin(async (tx) => {
    const invRows = await tx<RawInvitationRow[]>`
      select ${tx.unsafe(INVITATION_COLUMNS)}
      from partner_invitations
      where token_sha256 = ${hashToken(token)}
      limit 1
      for update
    `;
    const raw = invRows[0];
    if (!raw) {
      return { ok: false, error: { code: 'token_invalid', message: 'Invitation not found' } } as const;
    }
    const invitation = rowToInvitation(raw);
    if (invitation.status === 'declined') {
      return { ok: true, result: { invitation } } as const;
    }
    if (invitation.status === 'accepted') {
      return { ok: false, error: { code: 'token_already_used', message: 'Invitation was already redeemed' } } as const;
    }
    if (invitation.status === 'cancelled') {
      return { ok: false, error: { code: 'token_cancelled', message: 'Invitation was cancelled' } } as const;
    }
    if (invitation.status === 'expired' || invitation.expires_at.getTime() <= Date.now()) {
      return { ok: false, error: { code: 'token_expired', message: 'Invitation has expired' } } as const;
    }
    const updated = await tx<RawInvitationRow[]>`
      update partner_invitations
      set status = 'declined'
      where id = ${invitation.id}
      returning ${tx.unsafe(INVITATION_COLUMNS)}
    `;
    const updatedRaw = updated[0];
    if (!updatedRaw) {
      throw new Error('partner_invitation_decline_failed');
    }
    return { ok: true, result: { invitation: rowToInvitation(updatedRaw) } } as const;
  });
}

export interface SentInvitationSummary {
  status: PartnerInvitationRow['status'];
  invitee_email: string;
  expires_at: Date;
  created_at: Date;
}

/**
 * Inviter card: the inviter's most-recent sent invitation, whatever its status.
 * A pending row past its TTL is surfaced as 'expired' (lazy — the cron flips it
 * too, but the card must not lie between cron runs). Returns null when the
 * inviter never sent one. Prefer this only when the inviter has NO partner yet;
 * a redeemed pairing shows the partner instead.
 */
export async function loadSentInvitation(
  inviterUserId: bigint,
  client: Sql = sql,
): Promise<SentInvitationSummary | null> {
  const rows = await client<RawInvitationRow[]>`
    select ${client.unsafe(INVITATION_COLUMNS)}
    from partner_invitations
    where inviter_user_id = ${inviterUserId}
    order by created_at desc
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  const inv = rowToInvitation(row);
  const status =
    inv.status === 'pending' && inv.expires_at.getTime() <= Date.now() ? 'expired' : inv.status;
  return {
    status,
    invitee_email: inv.invitee_email,
    expires_at: inv.expires_at,
    created_at: inv.created_at,
  };
}
