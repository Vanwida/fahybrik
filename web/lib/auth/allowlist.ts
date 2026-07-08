import { sql } from '../db';

/**
 * The single club an APPROVED coach email may join on its first Clerk login, or
 * null when the email is not approved.
 *
 * This is the real login door (issue #39): the Clerk path used to auto-provision
 * ANY authenticated user into a brand-new coach workspace. Now only an
 * `status='approved'` row in `coach_allowlist` gets in, and it joins the EXISTING
 * club named by that row's `coach_id` — provisioning never mints a stray club.
 *
 * An approved row with a NULL `coach_id` (a branch without the seeded club, or a
 * misconfigured entry) returns null: better no session than a coach attached to
 * nothing. The `COACH_ALLOWLIST` env break-glass is intentionally NOT honoured
 * here — it carries no club id, so it can only feed the legacy magic-link path.
 */
export async function approvedCoachTarget(
  email: string,
): Promise<{ coach_id: bigint } | null> {
  const normalized = email.toLowerCase();
  const rows = await sql<{ coach_id: string | null }[]>`
    select coach_id::text as coach_id
    from coach_allowlist
    where email = ${normalized} and status = 'approved'
    limit 1
  `;
  const row = rows[0];
  if (!row || row.coach_id === null) return null;
  return { coach_id: BigInt(row.coach_id) };
}
