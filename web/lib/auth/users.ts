import { sql } from '../db';
import { deriveDisplayName } from '../identity/display-name';

export interface UserRow {
  id: bigint;
  email: string;
  apple_user_id: string | null;
  role: 'athlete' | 'coach' | 'admin';
}

export interface AthleteRow {
  id: bigint;
  user_id: bigint;
  full_name: string;
  onboarded_at: Date | null;
}

export interface CoachRow {
  id: bigint;
  user_id: bigint;
  full_name: string;
}

interface AppleIdentity {
  apple_user_id: string;
  email: string | null;
  /**
   * The `email_verified` claim from the verified Apple identity token. We only
   * link a fresh apple_user_id onto a pre-existing account matched by email
   * when Apple asserts the email is verified — otherwise an unverified email
   * collision could be used to take over an existing account.
   */
  email_verified: boolean;
}

interface AppleProfileHints {
  full_name?: string | null;
}

export interface AppleAuthResult {
  user: UserRow;
  athlete: AthleteRow;
}

function rowToUser(r: {
  id: string;
  email: string;
  apple_user_id: string | null;
  role: UserRow['role'];
}): UserRow {
  return {
    id: BigInt(r.id),
    email: r.email,
    apple_user_id: r.apple_user_id,
    role: r.role,
  };
}

function rowToAthlete(r: {
  id: string;
  user_id: string;
  full_name: string;
  onboarded_at: Date | null;
}): AthleteRow {
  return {
    id: BigInt(r.id),
    user_id: BigInt(r.user_id),
    full_name: r.full_name,
    onboarded_at: r.onboarded_at,
  };
}

function rowToCoach(r: { id: string; user_id: string; full_name: string }): CoachRow {
  return { id: BigInt(r.id), user_id: BigInt(r.user_id), full_name: r.full_name };
}

/**
 * Find (NEVER create) the athlete account for a verified Apple identity — the
 * LOGIN path. Membership is provisioned ONLY by the coach's alta + invite claim
 * (redeemAthleteInvitation); a bare Sign in with Apple must never mint an
 * account (an organic App Store download is sent to the membership funnel).
 * Resolution, DB-first adoption:
 *   1. match by apple_user_id → the account.
 *   2. else, ONLY when Apple asserts the email is verified, match by email and
 *      link this apple_user_id onto that pre-provisioned account (the athlete the
 *      coach created by email who signs in directly instead of via the claim link).
 *   3. neither → null → the route answers 404 no_account.
 * An unverified email match is skipped (account-takeover guard). A matched user
 * with no athlete row (e.g. a coach account) also returns null.
 */
export async function findAthleteForApple(
  identity: AppleIdentity,
): Promise<AppleAuthResult | null> {
  return await sql.begin(async (tx) => {
    const byApple = await tx<{
      id: string;
      email: string;
      apple_user_id: string | null;
      role: UserRow['role'];
    }[]>`
      select id::text as id, email, apple_user_id, role
      from users
      where apple_user_id = ${identity.apple_user_id}
        and deleted_at is null
      limit 1
    `;

    let userRow = byApple[0];

    // Only attempt to link a new apple_user_id onto an existing account by
    // matching email when Apple asserts the email is verified. An unverified
    // email match is not trustworthy and would allow account takeover, so we
    // skip the link and fall through to creating a fresh account below.
    if (!userRow && identity.email && identity.email_verified) {
      const byEmail = await tx<{
        id: string;
        email: string;
        apple_user_id: string | null;
        role: UserRow['role'];
      }[]>`
        select id::text as id, email, apple_user_id, role
        from users
        where email = ${identity.email}
          and deleted_at is null
        limit 1
      `;
      const existing = byEmail[0];
      if (existing) {
        const updated = await tx<{
          id: string;
          email: string;
          apple_user_id: string | null;
          role: UserRow['role'];
        }[]>`
          update users
          set apple_user_id = ${identity.apple_user_id},
              last_seen_at = now()
          where id = ${BigInt(existing.id)}
          returning id::text as id, email, apple_user_id, role
        `;
        userRow = updated[0];
      }
    }

    // LOGIN NEVER CREATES. No matching account (by apple_user_id or verified
    // email) → null; the route turns this into 404 no_account → the funnel.
    if (!userRow) return null;
    await tx`update users set last_seen_at = now() where id = ${BigInt(userRow.id)}`;

    const userId = BigInt(userRow.id);
    const existingAthlete = await tx<{
      id: string;
      user_id: string;
      full_name: string;
      onboarded_at: Date | null;
    }[]>`
      select id::text as id, user_id::text as user_id, full_name, onboarded_at
      from athletes
      where user_id = ${userId}
      limit 1
    `;

    // A matched account with no athlete row (e.g. a coach account) is not an
    // athlete membership → treat as no account.
    const athleteRow = existingAthlete[0];
    if (!athleteRow) return null;

    return {
      user: rowToUser(userRow),
      athlete: rowToAthlete(athleteRow),
    };
  });
}

/**
 * Find (NEVER create) the athlete account for a plain email — the passwordless
 * EMAIL-CODE login path (iOS). This is the email sibling of `findAthleteForApple`
 * and honours the same find-only contract: LOGIN NEVER PROVISIONS MEMBERSHIP.
 * An email with no matching account (or one that resolves to a coach with no
 * athlete row) returns null; the caller turns that into a generic "invalid code"
 * WITHOUT revealing whether the email exists.
 *
 * Resolution:
 *   1. match the (non-deleted) `users` row by email (users.email is unique).
 *   2. require a 1:1 `athletes` row for it — a coach-only account is not an
 *      athlete membership → null.
 * No apple_user_id linking happens here (email-code carries no Apple identity);
 * we only stamp last_seen_at on the resolved account, exactly like the Apple path.
 */
export async function findAthleteByEmail(email: string): Promise<AppleAuthResult | null> {
  const normalized = email.toLowerCase();
  return await sql.begin(async (tx) => {
    const byEmail = await tx<{
      id: string;
      email: string;
      apple_user_id: string | null;
      role: UserRow['role'];
    }[]>`
      select id::text as id, email, apple_user_id, role
      from users
      where email = ${normalized}
        and deleted_at is null
      limit 1
    `;
    const userRow = byEmail[0];
    // LOGIN NEVER CREATES. No account for this email → null → generic invalid code.
    if (!userRow) return null;
    await tx`update users set last_seen_at = now() where id = ${BigInt(userRow.id)}`;

    const userId = BigInt(userRow.id);
    const existingAthlete = await tx<{
      id: string;
      user_id: string;
      full_name: string;
      onboarded_at: Date | null;
    }[]>`
      select id::text as id, user_id::text as user_id, full_name, onboarded_at
      from athletes
      where user_id = ${userId}
      limit 1
    `;
    // A matched account with no athlete row (e.g. a coach) is not an athlete
    // membership → treat as no account.
    const athleteRow = existingAthlete[0];
    if (!athleteRow) return null;

    return {
      user: rowToUser(userRow),
      athlete: rowToAthlete(athleteRow),
    };
  });
}

export interface CoachAuthResult {
  user: UserRow;
  coach: CoachRow;
}

/** Identity read off the verified Clerk session for on-demand provisioning. */
export interface ClerkCoachIdentity {
  /** Clerk user id (`user_xxx`) — the identity bridge key. Required. */
  clerk_user_id: string;
  /** Primary email from the Clerk session. Required (users.email is NOT NULL). */
  email: string;
  /** Optional name parts from the Clerk profile — used to seed coaches.full_name. */
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
}

/**
 * Provision (find-or-create) the coach for an AUTHENTICATED Clerk user on
 * demand — the self-serve path. This is what makes the coach dashboard work
 * without the (optional) Clerk webhook: the FIRST time a freshly signed-up
 * Clerk user reaches a coach surface, `getCoachSession` calls this to mint
 * their `users` + `coaches` rows and grant the coach role.
 *
 * It is the clerk-keyed sibling of `findOrCreateCoachByEmail` (the magic-link
 * path) and mirrors the webhook's `syncUser` semantics so there is ONE
 * provisioning model, not two:
 *   - resolve the `users` row LOOKUP-FIRST — by `clerk_user_id`, then by email —
 *     NOT insert-first: a coach seeded in the DB before their first login has a
 *     row with a NULL clerk_user_id, and inserting keyed by clerk_user_id would
 *     collide with that row's email on users_email_unique (a constraint the
 *     `on conflict (clerk_user_id)` target does not cover) and 500 before ever
 *     reaching adoption;
 *   - a row seeded for this email with a NULL clerk_user_id is ADOPTED by
 *     stamping the clerk_user_id (never a duplicate); a row already bridged to a
 *     DIFFERENT clerk_user_id is REFUSED (`coach_email_linked_to_other_clerk_user`)
 *     rather than silently hijacked;
 *   - only a genuinely-new coach (no bridged row, no seeded email) is INSERTed;
 *   - ensure a `coaches` row (1:1 via coaches_user_id_unique);
 *   - grant the `coach` role (idempotent; never strips other roles).
 *
 * Idempotent + race-safe: runs in one transaction. Returning-user revival and
 * email adoption are id-scoped updates; the genuinely-new insert uses
 * `on conflict (clerk_user_id)` so two parallel first-hits from the SAME new
 * login converge on one row. Existing unique constraints (users.clerk_user_id
 * partial unique, users.email unique, coaches.user_id unique,
 * user_roles(user_id,role) unique) backstop the writes.
 *
 * Multi-tenant: a brand-new coach gets their OWN coaches.id with zero athletes
 * — an empty, scoped dashboard. It NEVER touches another coach's data.
 */
export async function findOrCreateCoachByClerkUser(
  identity: ClerkCoachIdentity,
): Promise<CoachAuthResult> {
  const email = identity.email.toLowerCase();
  const display_name = deriveDisplayName({
    first_name: identity.first_name,
    last_name: identity.last_name,
    username: identity.username,
    email,
  });

  return await sql.begin(async (tx) => {
    // Coach provisioning is LOOKUP-FIRST, never insert-first. A coach can exist in
    // the DB before they ever sign in — the official "DB first, Clerk after" alta
    // path (webhook / allowlist / manual insert) leaves a users row with a NULL
    // clerk_user_id. If we inserted keyed by clerk_user_id first, that new row's
    // email would collide with the seeded row on users_email_unique — a constraint
    // the `on conflict (clerk_user_id)` target does NOT cover — so the statement
    // throws before ever reaching adoption (a coach seeded first got a 500 on their
    // first login). So resolve the row by clerk_user_id, then by email, and only
    // INSERT when neither exists.
    type UserSel = {
      id: string;
      email: string;
      apple_user_id: string | null;
      role: UserRow['role'];
      clerk_user_id: string | null;
    };

    // 1) Returning user — already bridged to this Clerk id (revive if soft-deleted).
    const byClerk = await tx<UserSel[]>`
      select id::text as id, email, apple_user_id, role, clerk_user_id
      from users
      where clerk_user_id = ${identity.clerk_user_id}
      limit 1
    `;
    let userRow: UserSel | undefined = byClerk[0];
    if (userRow) {
      const revived = await tx<UserSel[]>`
        update users
        set last_seen_at = now(), updated_at = now(), deleted_at = null
        where id = ${BigInt(userRow.id)}
        returning id::text as id, email, apple_user_id, role, clerk_user_id
      `;
      userRow = revived[0];
    }

    // 2) DB-first alta — a row seeded for this email, not yet bridged to Clerk.
    //    Adopt it by stamping the clerk_user_id (never insert a duplicate; email is
    //    unique). If the email is already bridged to a DIFFERENT Clerk id, REFUSE:
    //    another identity owns this account, and silently rewriting the bridge key
    //    would hand it over. role is left untouched on an existing row.
    if (!userRow) {
      const byEmail = await tx<UserSel[]>`
        select id::text as id, email, apple_user_id, role, clerk_user_id
        from users
        where email = ${email}
        limit 1
      `;
      const existing = byEmail[0];
      if (existing) {
        if (existing.clerk_user_id && existing.clerk_user_id !== identity.clerk_user_id) {
          throw new Error('coach_email_linked_to_other_clerk_user');
        }
        const adopted = await tx<UserSel[]>`
          update users
          set clerk_user_id = ${identity.clerk_user_id},
              last_seen_at = now(), updated_at = now(), deleted_at = null
          where id = ${BigInt(existing.id)}
          returning id::text as id, email, apple_user_id, role, clerk_user_id
        `;
        userRow = adopted[0];
      }
    }

    // 3) Genuinely new coach — no bridged row, no seeded email. Insert fresh. The
    //    `on conflict (clerk_user_id)` keeps two parallel first-hits from the SAME
    //    new login race-safe (the loser adopts the winner's row). role is NOT NULL
    //    with no default; self-serve signups are coaches (authz flows via user_roles).
    if (!userRow) {
      const inserted = await tx<UserSel[]>`
        insert into users (clerk_user_id, email, role, last_seen_at)
        values (${identity.clerk_user_id}, ${email}, 'coach', now())
        on conflict (clerk_user_id) where clerk_user_id is not null
        do update set
          last_seen_at = now(),
          updated_at = now(),
          deleted_at = null
        returning id::text as id, email, apple_user_id, role, clerk_user_id
      `;
      userRow = inserted[0];
    }

    if (!userRow) {
      throw new Error('user_provision_failed');
    }
    const userId = BigInt(userRow.id);

    // 3) Ensure the coach row (1:1). Insert idempotently; on conflict re-select.
    //    Seed full_name from the derived display name when we have one, else a
    //    neutral placeholder the coach edits in Ajustes (the webhook keeps it in
    //    sync if it later fires with a real name).
    const insertedCoach = await tx<{ id: string; user_id: string; full_name: string }[]>`
      insert into coaches (user_id, full_name)
      values (${userId}, ${display_name || 'Coach'})
      on conflict (user_id) do nothing
      returning id::text as id, user_id::text as user_id, full_name
    `;

    let coachRow = insertedCoach[0];
    if (!coachRow) {
      const existing = await tx<{ id: string; user_id: string; full_name: string }[]>`
        select id::text as id, user_id::text as user_id, full_name
        from coaches
        where user_id = ${userId}
        limit 1
      `;
      coachRow = existing[0];
    }

    if (!coachRow) {
      throw new Error('coach_provision_failed');
    }

    // 4) Grant the coach role in user_roles (authz source of truth). Idempotent;
    //    leaves any other role (admin/athlete) this login holds intact.
    await tx`
      insert into user_roles (user_id, role)
      values (${userId}, 'coach')
      on conflict (user_id, role) do nothing
    `;

    return {
      user: rowToUser(userRow),
      coach: rowToCoach(coachRow),
    };
  });
}

export async function findOrCreateCoachByEmail(email: string): Promise<CoachAuthResult> {
  return await sql.begin(async (tx) => {
    const existingUsers = await tx<{
      id: string;
      email: string;
      apple_user_id: string | null;
      role: UserRow['role'];
    }[]>`
      select id::text as id, email, apple_user_id, role
      from users
      where email = ${email.toLowerCase()}
        and deleted_at is null
      limit 1
    `;

    let userRow = existingUsers[0];

    if (!userRow) {
      const inserted = await tx<{
        id: string;
        email: string;
        apple_user_id: string | null;
        role: UserRow['role'];
      }[]>`
        insert into users (email, role, last_seen_at)
        values (${email.toLowerCase()}, 'coach', now())
        returning id::text as id, email, apple_user_id, role
      `;
      userRow = inserted[0];
    } else {
      await tx`update users set last_seen_at = now() where id = ${BigInt(userRow.id)}`;
    }

    if (!userRow) {
      throw new Error('user_upsert_failed');
    }
    const userId = BigInt(userRow.id);

    const existingCoach = await tx<{ id: string; user_id: string; full_name: string }[]>`
      select id::text as id, user_id::text as user_id, full_name
      from coaches
      where user_id = ${userId}
      limit 1
    `;

    let coachRow = existingCoach[0];
    if (!coachRow) {
      const inserted = await tx<{ id: string; user_id: string; full_name: string }[]>`
        insert into coaches (user_id, full_name)
        values (${userId}, ${'Coach'})
        returning id::text as id, user_id::text as user_id, full_name
      `;
      coachRow = inserted[0];
    }

    if (!coachRow) {
      throw new Error('coach_upsert_failed');
    }

    // Multi-role RBAC (0041): record the coach role in user_roles so the table
    // stays authoritative for new accounts. Idempotent — does NOT remove any
    // other role this login may already hold (admin, athlete).
    await tx`
      insert into user_roles (user_id, role)
      values (${userId}, 'coach')
      on conflict (user_id, role) do nothing
    `;

    return {
      user: rowToUser(userRow),
      coach: rowToCoach(coachRow),
    };
  });
}
