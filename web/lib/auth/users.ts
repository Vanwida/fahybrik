import { sql } from '../db';

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
