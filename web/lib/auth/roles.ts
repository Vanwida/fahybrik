import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';

// Multi-role RBAC (migration 0041).
//
// Roles live in the `user_roles` join table so one login can hold several roles
// at once (admin + coach + athlete). The legacy `users.role` enum is kept for
// compat: when a user has NO rows in user_roles (e.g. a stale account created
// before the backfill ran), we fall back to users.role so nobody is locked out.

export const ROLES = ['admin', 'coach', 'athlete'] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/**
 * Every role this user holds, deduped. Reads user_roles; if that's empty,
 * falls back to the legacy users.role single value so pre-backfill accounts
 * still resolve to at least one role.
 */
export async function userRoles(user_id: bigint, sql: Sql = defaultSql): Promise<Role[]> {
  const rows = await sql<{ role: string }[]>`
    select role from user_roles where user_id = ${user_id}
  `;

  if (rows.length > 0) {
    return rows.map((r) => r.role).filter(isRole);
  }

  // Fallback: legacy single-role column.
  const legacy = await sql<{ role: string }[]>`
    select role::text as role from users where id = ${user_id} and deleted_at is null limit 1
  `;
  const role = legacy[0]?.role;
  return role && isRole(role) ? [role] : [];
}

/**
 * Does this user hold the given role? Checks user_roles directly (fast path),
 * then falls back to users.role for pre-backfill accounts.
 */
export async function hasRole(
  user_id: bigint,
  role: Role,
  sql: Sql = defaultSql,
): Promise<boolean> {
  const rows = await sql<{ ok: boolean }[]>`
    select true as ok from user_roles where user_id = ${user_id} and role = ${role} limit 1
  `;
  if (rows.length > 0) return true;

  // Fallback only when the user has NO user_roles rows at all — otherwise the
  // table is authoritative and a miss means "doesn't have it".
  const any = await sql<{ ok: boolean }[]>`
    select true as ok from user_roles where user_id = ${user_id} limit 1
  `;
  if (any.length > 0) return false;

  const legacy = await sql<{ role: string }[]>`
    select role::text as role from users where id = ${user_id} and deleted_at is null limit 1
  `;
  return legacy[0]?.role === role;
}

/**
 * Grant a role to a user (idempotent — ON CONFLICT DO NOTHING on the
 * unique(user_id, role)). Returns true when a new row was created.
 */
export async function grantRole(
  user_id: bigint,
  role: Role,
  sql: Sql = defaultSql,
): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    insert into user_roles (user_id, role)
    values (${user_id}, ${role})
    on conflict (user_id, role) do nothing
    returning id::text as id
  `;
  return rows.length > 0;
}
