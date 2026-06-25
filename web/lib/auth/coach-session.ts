import { auth, currentUser } from '@clerk/nextjs/server';
import { sql } from '../db';
import { userRoles, type Role } from './roles';
import { findOrCreateCoachByClerkUser } from './users';

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

// ⚠️ DEV-ONLY LOGIN BYPASS: en `next dev` (NODE_ENV==='development') sin sesión
// Clerk, resolvemos un coach fijo para usar el dashboard sin login. NODE_ENV es
// 'production' en todo build/deploy de Vercel (incl. previews) → nunca activo en
// prod. Pareja del bypass en proxy.ts. QUITAR cuando el login de Clerk funcione
// en local. El coach es el dueño del atleta sembrado (alexsole@gmail.com).
const DEV_BYPASS_COACH_EMAIL = 'alexsole@gmail.com';

async function coachSessionByEmail(email: string, jti: string): Promise<CoachSession | null> {
  const rows = await sql<
    { user_id: string; coach_id: string; email: string; full_name: string }[]
  >`
    select u.id::text as user_id, c.id::text as coach_id, u.email, c.full_name
    from users u
    join coaches c on c.user_id = u.id
    where u.email = ${email} and u.deleted_at is null
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
    jti,
    roles,
  };
}

/** Resolve the coach session for a Clerk user id, or null if no coach row yet. */
async function coachSessionByClerkUserId(
  clerkUserId: string,
  jti: string,
): Promise<CoachSession | null> {
  const rows = await sql<
    { user_id: string; coach_id: string; email: string; full_name: string }[]
  >`
    select u.id::text as user_id, c.id::text as coach_id, u.email, c.full_name
    from users u
    join coaches c on c.user_id = u.id
    where u.clerk_user_id = ${clerkUserId} and u.deleted_at is null
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
    jti,
    roles,
  };
}

export async function getCoachSession(): Promise<CoachSession | null> {
  const { userId, sessionId } = await auth();
  if (!userId) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.warn(`[DEV AUTH BYPASS] getCoachSession → ${DEV_BYPASS_COACH_EMAIL} (solo NODE_ENV=development)`);
      return coachSessionByEmail(DEV_BYPASS_COACH_EMAIL, 'dev-bypass');
    }
    return null;
  }

  const jti = sessionId ?? '';

  // Fast path: the Clerk login already maps to a coach row.
  const existing = await coachSessionByClerkUserId(userId, jti);
  if (existing) return existing;

  // Self-serve provisioning: an authenticated Clerk user reached a coach surface
  // but has no coach row yet (fresh signup; the webhook is optional and may not
  // have fired). Mint the users + coaches rows on demand from the verified Clerk
  // identity, then resolve. This is the ONE provisioning path for coaches — DRY
  // with the magic-link flow (both go through lib/auth/users). Idempotent and
  // race-safe (see findOrCreateCoachByClerkUser).
  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress?.trim();
  if (!email) {
    // No verified email on the Clerk session → we cannot satisfy users.email
    // (NOT NULL). Don't guess; treat as no session so the caller redirects to
    // sign-in rather than 500ing. (Clerk requires an email to sign up, so this
    // is effectively unreachable.)
    return null;
  }

  await findOrCreateCoachByClerkUser({
    clerk_user_id: userId,
    email,
    first_name: clerkUser?.firstName,
    last_name: clerkUser?.lastName,
    username: clerkUser?.username,
  });

  // Re-resolve through the same path so the returned shape (roles, ids) is
  // produced by exactly one query, no special-casing of the just-created row.
  return coachSessionByClerkUserId(userId, jti);
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
