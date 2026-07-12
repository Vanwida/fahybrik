import { createHash, timingSafeEqual } from 'node:crypto';

// App Store review access gate.
//
// Apple's reviewer cannot complete our normal athlete login: Sign in with Apple
// resolves to 404 no_account (they are not a provisioned member) and the email
// one-time code is only emailed to real members' inboxes (which the reviewer does
// not have). To let App Review sign in, a FIXED email + code pair — handed to Apple
// ONLY in the App Store Connect review notes — logs into a dedicated review athlete
// (seeded by infra/scripts/seed_review_account.ts).
//
// The gate is ENV-ONLY: it exists solely when BOTH REVIEW_ACCESS_EMAIL and
// REVIEW_ACCESS_CODE are set. If either is missing the helper returns null and the
// auth flow behaves EXACTLY as before — the gate does not exist. The fixed code is
// never logged, and both auth routes keep their responses byte-identical to the
// normal flow so the gate is invisible to anyone who doesn't already hold the pair.

export interface ReviewAccessGate {
  /** Normalized (trim + lowercase) reviewer email — matched against the request email. */
  email: string;
  /** The fixed reviewer code (alphanumeric). Compared constant-time; never logged. */
  code: string;
}

/**
 * The active review gate, or null when it is not configured. Reads env at call
 * time (not module load) so the gate can be toggled without a redeploy and so
 * tests can set/unset the vars per-case.
 */
export function reviewAccessGate(): ReviewAccessGate | null {
  const email = process.env.REVIEW_ACCESS_EMAIL?.trim().toLowerCase();
  const code = process.env.REVIEW_ACCESS_CODE;
  if (!email || !code) return null;
  return { email, code };
}

/**
 * Constant-time string equality. Both sides are sha256-hashed to fixed-length
 * (32-byte) buffers before comparison, so `timingSafeEqual` neither throws on a
 * length mismatch nor leaks the code's length via timing — and the comparison
 * itself does not short-circuit on the first differing byte.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}
