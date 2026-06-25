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

export async function findOrCreateAthleteForApple(
  identity: AppleIdentity,
  hints: AppleProfileHints = {},
): Promise<AppleAuthResult> {
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

    if (!userRow) {
      const placeholderEmail =
        identity.email ?? `apple-${identity.apple_user_id}@privaterelay.appleid.placeholder`;
      const inserted = await tx<{
        id: string;
        email: string;
        apple_user_id: string | null;
        role: UserRow['role'];
      }[]>`
        insert into users (email, apple_user_id, role, last_seen_at)
        values (${placeholderEmail}, ${identity.apple_user_id}, 'athlete', now())
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

    let athleteRow = existingAthlete[0];
    if (!athleteRow) {
      const fullName = hints.full_name?.trim() || 'Athlete';
      const inserted = await tx<{
        id: string;
        user_id: string;
        full_name: string;
        onboarded_at: Date | null;
      }[]>`
        insert into athletes (user_id, full_name)
        values (${userId}, ${fullName})
        returning id::text as id, user_id::text as user_id, full_name, onboarded_at
      `;
      athleteRow = inserted[0];
    }

    if (!athleteRow) {
      throw new Error('athlete_upsert_failed');
    }

    // Multi-role RBAC (0041): ensure the athlete role is recorded in
    // user_roles so the table stays authoritative for new accounts. Idempotent.
    await tx`
      insert into user_roles (user_id, role)
      values (${userId}, 'athlete')
      on conflict (user_id, role) do nothing
    `;

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
 *   - upsert the `users` row keyed by `clerk_user_id`;
 *   - if no clerk-keyed row but one exists for this email (seeded by the
 *     webhook / allowlist / another flow), ADOPT it by stamping the
 *     clerk_user_id (never create a duplicate);
 *   - ensure a `coaches` row (1:1 via coaches_user_id_unique);
 *   - grant the `coach` role (idempotent; never strips other roles).
 *
 * Idempotent + race-safe: runs in one transaction, every write uses ON CONFLICT
 * against the existing unique constraints (users.clerk_user_id partial unique,
 * users.email unique, coaches.user_id unique, user_roles(user_id,role) unique),
 * so concurrent first-hits from the same login converge on the same rows.
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
    // 1) Upsert the users row keyed by clerk_user_id. A returning row here means
    //    either a brand-new insert or an existing clerk-linked row (revived if
    //    it was soft-deleted). role is NOT NULL with no default; brand-new
    //    self-serve signups are coaches here, so seed 'coach' (authz still flows
    //    through user_roles below). An existing row keeps its role untouched.
    const upserted = await tx<{
      id: string;
      email: string;
      apple_user_id: string | null;
      role: UserRow['role'];
    }[]>`
      insert into users (clerk_user_id, email, role, last_seen_at)
      values (${identity.clerk_user_id}, ${email}, 'coach', now())
      on conflict (clerk_user_id) where clerk_user_id is not null
      do update set
        last_seen_at = now(),
        updated_at = now(),
        deleted_at = null
      returning id::text as id, email, apple_user_id, role
    `;

    let userRow = upserted[0];

    // 2) No clerk-keyed row matched (the email may already exist from the
    //    webhook/allowlist with a null clerk_user_id). Adopt it by stamping the
    //    clerk_user_id rather than inserting a duplicate (users.email is unique).
    if (!userRow) {
      const adopted = await tx<{
        id: string;
        email: string;
        apple_user_id: string | null;
        role: UserRow['role'];
      }[]>`
        update users
        set clerk_user_id = ${identity.clerk_user_id},
            last_seen_at = now(),
            updated_at = now(),
            deleted_at = null
        where email = ${email} and clerk_user_id is null
        returning id::text as id, email, apple_user_id, role
      `;
      userRow = adopted[0];
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
