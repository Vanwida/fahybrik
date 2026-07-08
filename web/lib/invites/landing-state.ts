/**
 * Pure state derivation for the invitation landing pages (partner redeem +
 * coach→athlete claim). Kept free of DB/IO so it can be unit-tested and shared
 * by both landing routes.
 *
 * Precedence (terminal states win over the time check so the message reflects
 * what actually happened):
 *   1. no invitation row          → 'invalid'
 *   2. already used               → 'used'
 *   3. explicitly cancelled/revoked → 'cancelled'
 *   4. invitee declined           → 'declined'
 *   5. status 'expired' OR past expiry → 'expired'
 *   6. otherwise (pending, live)  → 'valid'
 */
export type InviteLandingState = 'invalid' | 'expired' | 'cancelled' | 'declined' | 'used' | 'valid';

/**
 * Normalized descriptor so the partner enum
 * ('pending'|'accepted'|'expired'|'cancelled') and the athlete enum
 * ('pending'|'redeemed'|'expired'|'revoked') map onto one shape.
 */
export interface InviteStatusDescriptor {
  /** accepted (partner) / redeemed (athlete). */
  used: boolean;
  /** cancelled (partner) / revoked (athlete). */
  cancelled: boolean;
  /**
   * Invitee explicitly declined (partner only; the athlete claim enum has no
   * equivalent, so it omits this — treated as false).
   */
  declined?: boolean;
  /** status column is literally 'expired'. */
  expiredStatus: boolean;
  /** invitation expiry timestamp. */
  expiresAt: Date;
}

export function deriveInviteLandingState(
  descriptor: InviteStatusDescriptor | null,
  now: Date = new Date(),
): InviteLandingState {
  if (!descriptor) return 'invalid';
  if (descriptor.used) return 'used';
  if (descriptor.cancelled) return 'cancelled';
  if (descriptor.declined) return 'declined';
  if (descriptor.expiredStatus || descriptor.expiresAt.getTime() <= now.getTime()) {
    return 'expired';
  }
  return 'valid';
}
