import { auth } from '@clerk/nextjs/server';
import { sql } from '../db';
import { userRoles, type Role } from './roles';

// Coach dashboard session — Clerk is authentication, the DB is authorization.
//
// Identity comes from the Clerk session (`auth()`, async in Core 3); the user
// is resolved in our DB by `clerk_user_id`. Roles come from `user_roles` (the
// authz source of truth). The old hand-rolled magic-link cookie + CSRF/Origin
// guard are GONE — Clerk's session handling (signed, httpOnly, CSRF-safe by
// design) replaces all of it.
//
// The return shape is unchanged so every existing callsite keeps compiling.
// `jti` is populated with the Clerk session id.

export interface CoachSession {
  user_id: bigint;
  coach_id: bigint;
  email: string;
  full_name: string;
  jti: string;
  /** Every role this login holds (multi-role RBAC, migration 0041). */
  roles: Role[];
}

export async function getCoachSession(): Promise<CoachSession | null> {
  const { userId, sessionId } = await auth();
  if (!userId) return null;

  const rows = await sql<
    { user_id: string; coach_id: string; email: string; full_name: string }[]
  >`
    select u.id::text as user_id, c.id::text as coach_id, u.email, c.full_name
    from users u
    join coaches c on c.user_id = u.id
    where u.clerk_user_id = ${userId} and u.deleted_at is null
    limit 1
  `;

  const row = rows[0];
  if (!row) return null;

  const user_id = BigInt(row.user_id);
  const roles = await userRoles(user_id);

  return {
    user_id,
    coach_id: BigInt(row.coach_id),
    email: row.email,
    full_name: row.full_name,
    jti: sessionId ?? '',
    roles,
  };
}

// MIGRATION NOTE: COACH sign-out / cookie issuance moved to Clerk, so the two
// helpers below are now no-ops kept only so the old /auth/verify + /api/auth/logout
// routes still compile during the migration window. Sign-out flows through Clerk's
// <UserButton/> / <SignOutButton/>.
//
// IMPORTANT — do NOT remove session.ts or apple.ts: they are LIVE, not legacy.
// `apple.ts` powers Sign in with Apple (/api/auth/apple) and `session.ts`'s
// verifySession is the Bearer-token verifier behind every iOS athlete API route
// (sync, plan, assignments, export, subscription…). The athlete/iOS surface does
// NOT use Clerk. magic-link.ts + demo-login.ts are likewise still wired (coach
// email magic-link + demo sign-in). Only the no-op cookie helpers below are
// removable, once /auth/verify + /api/auth/logout stop importing them.

/** @deprecated Clerk owns sign-out now. No-op kept for callsite compat. */
export async function clearCoachSession(): Promise<void> {
  // No-op: Clerk handles session revocation.
}

export interface CoachCookieOptions {
  token: string;
  expires_at: Date;
}

/** @deprecated Legacy magic-link cookie issuance. No-op kept for compat. */
export async function setCoachSessionCookie(_opts: CoachCookieOptions): Promise<void> {
  // No-op: Clerk issues and manages the session cookie.
}
