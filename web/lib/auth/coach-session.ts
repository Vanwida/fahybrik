import { auth, currentUser } from '@clerk/nextjs/server';
import { sql } from '../db';
import { userRoles, type Role } from './roles';
import { provisionCoachMember } from './users';
import { approvedCoachTarget } from './allowlist';
import { DEMO_COACH_EMAILS, isDemoAccessEnabled } from './demo-access';
import { readDemoCoachCookieToken } from './demo-cookie';
import { audiences, verifySession } from './session';

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
  /**
   * The signed-in PERSON's display name (users.full_name), for attribution
   * ("editado por Alex"). Falls back to the club/coach row name for a legacy
   * single-coach whose users.full_name was backfilled from it — so this is
   * unchanged for existing coaches and is the member's own name for the team.
   */
  full_name: string;
  /** The club name (coaches.full_name) — the shared workspace the members share. */
  club_name: string;
  /** Coach photo URL (coaches.avatar_url); null = render initials. */
  avatar_url: string | null;
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

// A coach's data is scoped by coach_id (the club). Which humans may act as that
// club is now decided by `coach_members` (migration 0113), NOT the 1:1
// coaches.user_id owner link. The resolver therefore prefers the membership
// coach_id and FALLS BACK to the legacy owner link (c_owned) so any coach whose
// membership row hasn't been backfilled still resolves during the transition. A
// user with neither is not a coach → coach_id is null → null session.
//
// full_name is the PERSON (users.full_name) for attribution; club_name is the
// shared coaches.full_name. Single-club today, so `limit 1` on membership is
// unambiguous (a future multi-club member would need explicit club selection).
type CoachSessionRow = {
  user_id: string;
  coach_id: string | null;
  email: string;
  full_name: string;
  club_name: string;
  avatar_url: string | null;
};

async function resolveCoachSession(
  by: { email: string } | { clerk: string } | { uid: bigint },
  jti: string,
): Promise<CoachSession | null> {
  const predicate =
    'email' in by
      ? sql`u.email = ${by.email}`
      : 'clerk' in by
        ? sql`u.clerk_user_id = ${by.clerk}`
        : sql`u.id = ${by.uid}`;

  // Deterministic `limit 1`: a human in MORE than one club (or owning more than
  // one coaches row) always resolves to the same club — the OLDEST membership
  // (cm.added_at), ids as tie-breaks. Explicit club selection ("which club am I
  // acting as?") arrives with the door work (obra 2, docs/multi-coach-plan.html);
  // until then oldest-first is the stable, predictable pick.
  const rows = await sql<CoachSessionRow[]>`
    select
      u.id::text as user_id,
      coalesce(cm.coach_id, c_owned.id)::text as coach_id,
      u.email,
      coalesce(u.full_name, c_member.full_name, c_owned.full_name, '') as full_name,
      coalesce(c_member.full_name, c_owned.full_name, '') as club_name,
      coalesce(c_member.avatar_url, c_owned.avatar_url) as avatar_url
    from users u
    left join coach_members cm on cm.user_id = u.id and cm.removed_at is null
    left join coaches c_member on c_member.id = cm.coach_id
    left join coaches c_owned on c_owned.user_id = u.id
    where ${predicate} and u.deleted_at is null
    order by cm.added_at asc nulls last, cm.coach_id asc nulls last, c_owned.id asc nulls last
    limit 1
  `;
  const row = rows[0];
  if (!row || row.coach_id === null) return null;
  const user_id = BigInt(row.user_id);
  const roles = await userRoles(user_id);
  return {
    user_id,
    coach_id: BigInt(row.coach_id),
    email: row.email,
    full_name: row.full_name,
    club_name: row.club_name,
    avatar_url: row.avatar_url,
    jti,
    roles,
  };
}

const coachSessionByEmail = (email: string, jti: string) =>
  resolveCoachSession({ email }, jti);

/** Resolve the coach session for a Clerk user id, or null if not a club member. */
const coachSessionByClerkUserId = (clerkUserId: string, jti: string) =>
  resolveCoachSession({ clerk: clerkUserId }, jti);

/**
 * Resolve the coach session for a Clerk user id with NO Clerk request context.
 *
 * `getCoachSession()` below reads the identity from the browser's Clerk session
 * cookie. The MCP connector has no cookie and no Clerk session at all: it
 * carries an OAuth access token whose subject is a Clerk user id. This is the
 * SAME resolver reached with that id directly (`coach_members` first, legacy
 * `coaches.user_id` owner link as fallback) — one query, no second SELECT to
 * drift from this one.
 *
 * Two deliberate differences from the cookie path:
 *   - It does NOT provision. Joining a club off the allowlist is a
 *     first-login-through-the-browser concern; a token whose user is not
 *     already a member is simply not a coach here → null.
 *   - `jti` is empty. An OAuth access token has no Clerk SESSION id, and
 *     inventing one would put a value in that field that names nothing. No
 *     coach-session callsite reads `jti` (only the legacy athlete/magic-link
 *     paths do), so empty is both honest and inert.
 */
export function getCoachSessionForClerkUser(
  clerkUserId: string,
): Promise<CoachSession | null> {
  return coachSessionByClerkUserId(clerkUserId, '');
}

/** Resolve the coach session for a DB user id, or null if not a club member. */
const coachSessionByUserId = (userId: bigint, jti: string) =>
  resolveCoachSession({ uid: userId }, jti);

/**
 * DEMO-ONLY coach session. Returns a coach session from the gated demo cookie,
 * or null. Hard guarantees (see lib/auth/demo-access.ts):
 *   - caller must have already checked isDemoAccessEnabled();
 *   - the cookie is a real, DB-backed, revocable coach JWT (verifySession);
 *   - the resolved coach's email MUST be a known demo coach email, so a real
 *     or forged coach JWT can never be promoted through this path.
 */
async function resolveDemoCoachSession(): Promise<CoachSession | null> {
  const token = await readDemoCoachCookieToken();
  if (!token) return null;

  const verified = await verifySession(token, audiences.coach);
  if (!verified) return null;

  const session = await coachSessionByUserId(verified.user_id, verified.jti);
  if (!session) return null;

  // Final gate: only the seeded demo coaches may ride the demo cookie.
  if (!DEMO_COACH_EMAILS.has(session.email.toLowerCase())) return null;

  return session;
}

export async function getCoachSession(): Promise<CoachSession | null> {
  // Gated demo path, BEFORE Clerk. Invisible unless DEMO_ACCESS=1; falls
  // through to the real Clerk path when there is no valid demo cookie, so the
  // production auth flow is completely untouched.
  if (isDemoAccessEnabled()) {
    const demo = await resolveDemoCoachSession();
    if (demo) return demo;
  }

  const { userId, sessionId } = await auth();
  if (!userId) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[DEV AUTH BYPASS] getCoachSession → ${DEV_BYPASS_COACH_EMAIL} (solo NODE_ENV=development)`);
      return coachSessionByEmail(DEV_BYPASS_COACH_EMAIL, 'dev-bypass');
    }
    return null;
  }

  const jti = sessionId ?? '';

  // Fast path: the Clerk login is already a member of a club.
  const existing = await coachSessionByClerkUserId(userId, jti);
  if (existing) return existing;

  // No membership yet. The ALLOWLIST is the door (issue #39): the old behaviour
  // auto-minted a brand-new coach for ANY authenticated Clerk user (so a lead who
  // signed up could land on a coach dashboard). Now only an approved email gets
  // in, and it JOINS the existing club named by its allowlist row — provisioning
  // never mints a stray coach.
  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress?.trim().toLowerCase();
  if (!email) {
    // No verified email on the Clerk session → cannot satisfy users.email
    // (NOT NULL). Treat as no session so the caller redirects to sign-in rather
    // than 500ing. (Clerk requires an email to sign up, so this is unreachable.)
    return null;
  }

  const target = await approvedCoachTarget(email);
  if (!target) {
    // Not on the allowlist → NOT a coach. No session (the caller sends them away).
    return null;
  }

  await provisionCoachMember(
    {
      clerk_user_id: userId,
      email,
      first_name: clerkUser?.firstName,
      last_name: clerkUser?.lastName,
      username: clerkUser?.username,
    },
    target.coach_id,
  );

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
