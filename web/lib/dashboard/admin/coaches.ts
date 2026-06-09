import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';

// Coach approval administration (migrations 0040 + 0041).
//
// "Being a coach" = having an `approved` row in coach_allowlist (or the
// COACH_ALLOWLIST env var, see lib/auth/magic-link.ts). This module is the
// ADMIN side: list every allowlist entry with its status + sign-in state,
// approve/reject a pending request, and add an email directly (as approved).
//
// Self-service: a prospective coach can REQUEST access (requestCoachAccess →
// inserts a `pending` row). The admin then approves/rejects from /admin.
// Approved coaches sign in by magic-link with no redeploy; their `coaches` row
// is materialised on first login (findOrCreateCoachByEmail). snake_case rows.

export type CoachAllowlistStatus = 'pending' | 'approved' | 'rejected';

export interface AllowlistedCoach {
  email: string;
  status: CoachAllowlistStatus;
  created_at: Date;
  reviewed_at: Date | null;
  /** True once the coach has logged in at least once (has a `coaches` row). */
  has_signed_in: boolean;
}

/**
 * List every allowlist entry, newest first, annotated with whether the coach
 * has already signed in (materialised a `coaches` row). The LEFT JOIN through
 * `users` is by email — the same key the allowlist is stored under.
 */
export async function listCoachRequests(sql: Sql = defaultSql): Promise<AllowlistedCoach[]> {
  const rows = await sql<
    {
      email: string;
      status: CoachAllowlistStatus;
      created_at: Date;
      reviewed_at: Date | null;
      has_signed_in: boolean;
    }[]
  >`
    select
      a.email,
      a.status,
      a.created_at,
      a.reviewed_at,
      (c.id is not null) as has_signed_in
    from coach_allowlist a
    left join users u on u.email = a.email and u.deleted_at is null
    left join coaches c on c.user_id = u.id
    order by a.created_at desc, a.email asc
  `;
  return rows.map((r) => ({
    email: r.email,
    status: r.status,
    created_at: r.created_at,
    reviewed_at: r.reviewed_at,
    has_signed_in: r.has_signed_in,
  }));
}

export interface AddCoachResult {
  email: string;
  /** False when the email was already on the allowlist (idempotent no-op). */
  created: boolean;
}

/**
 * Admin adds a coach directly — inserts as `approved` so they can sign in
 * immediately. Idempotent: if the email already exists in ANY status, returns
 * created=false and leaves the existing row untouched (use setCoachStatus to
 * change an existing decision).
 */
export async function addApprovedCoach(
  input: { email: string; reviewed_by_user_id?: bigint | null },
  sql: Sql = defaultSql,
): Promise<AddCoachResult> {
  const email = input.email.trim().toLowerCase();
  const reviewedBy = input.reviewed_by_user_id ?? null;

  const rows = await sql<{ email: string }[]>`
    insert into coach_allowlist (email, status, created_by_user_id, reviewed_by_user_id, reviewed_at)
    values (${email}, 'approved', ${reviewedBy}, ${reviewedBy}, now())
    on conflict (email) do nothing
    returning email
  `;

  return { email, created: rows.length > 0 };
}

/**
 * Self-service request: a prospective coach asks for access. Inserts a
 * `pending` row (the table default). Idempotent — re-requesting an email that
 * already exists is a no-op and never resurrects a rejected/approved row.
 */
export async function requestCoachAccess(
  input: { email: string; created_by_user_id?: bigint | null },
  sql: Sql = defaultSql,
): Promise<AddCoachResult> {
  const email = input.email.trim().toLowerCase();
  const createdBy = input.created_by_user_id ?? null;

  const rows = await sql<{ email: string }[]>`
    insert into coach_allowlist (email, status, created_by_user_id)
    values (${email}, 'pending', ${createdBy})
    on conflict (email) do nothing
    returning email
  `;

  return { email, created: rows.length > 0 };
}

export interface SetCoachStatusResult {
  email: string;
  status: CoachAllowlistStatus;
  /** False when the email wasn't on the allowlist at all. */
  updated: boolean;
}

/**
 * Approve or reject an allowlist entry. Stamps reviewer + timestamp. Returns
 * updated=false when the email isn't present (the admin should add it first).
 */
export async function setCoachStatus(
  input: {
    email: string;
    status: Extract<CoachAllowlistStatus, 'approved' | 'rejected'>;
    reviewed_by_user_id?: bigint | null;
  },
  sql: Sql = defaultSql,
): Promise<SetCoachStatusResult> {
  const email = input.email.trim().toLowerCase();
  const reviewedBy = input.reviewed_by_user_id ?? null;

  const rows = await sql<{ email: string; status: CoachAllowlistStatus }[]>`
    update coach_allowlist
    set status = ${input.status},
        reviewed_by_user_id = ${reviewedBy},
        reviewed_at = now()
    where email = ${email}
    returning email, status
  `;

  const row = rows[0];
  return {
    email,
    status: row?.status ?? input.status,
    updated: rows.length > 0,
  };
}
