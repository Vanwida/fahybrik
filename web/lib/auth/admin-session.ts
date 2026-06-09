import { auth } from '@clerk/nextjs/server';
import { sql } from '../db';
import { hasRole, userRoles, type Role } from './roles';

// Admin surface session — Clerk is authentication, the DB is authorization.
//
// The admin dashboard rides the SAME Clerk login as the coach dashboard. The
// difference is the GATE: the admin surface requires the `admin` role, resolved
// from user_roles. Unlike getCoachSession this does NOT require a `coaches` row
// (an admin need not be a coach), so it joins only `users`.
//
// This is the server-side hard gate for /admin and /api/admin/*. There is no
// client-side bypass: a non-admin session resolves to null and the surface
// redirects. The old cookie + CSRF/Origin guard are replaced by Clerk.

export interface AdminSession {
  user_id: bigint;
  email: string;
  jti: string;
  roles: Role[];
}

/**
 * Resolve the current Clerk session and return it ONLY if it holds the admin
 * role. Returns null for: no Clerk session, unknown/deleted user, or a valid
 * coach/athlete session that is NOT also an admin.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const { userId, sessionId } = await auth();
  if (!userId) return null;

  const rows = await sql<{ user_id: string; email: string }[]>`
    select u.id::text as user_id, u.email
    from users u
    where u.clerk_user_id = ${userId} and u.deleted_at is null
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;

  const user_id = BigInt(row.user_id);

  // Hard gate: must hold the admin role.
  if (!(await hasRole(user_id, 'admin'))) return null;

  return {
    user_id,
    email: row.email,
    jti: sessionId ?? '',
    roles: await userRoles(user_id),
  };
}
