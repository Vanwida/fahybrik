// Coach profile — server-side read/write of the coach's public identity. The
// route is a thin auth + validation wrapper around these two functions, and the
// integration test exercises them directly against a real Neon branch (no mocks).

import { sql } from '@/lib/db';
import type { CoachProfilePatch } from './profile-schema';

export interface CoachProfile {
  full_name: string;
  /** Clerk-owned, read-only here — surfaced so the form can show it. */
  email: string;
  bio: string | null;
  avatar_url: string | null;
  specialties: string[];
  certifications: string[];
  studio_name: string | null;
  location: string | null;
}

interface CoachProfileRow {
  full_name: string;
  email: string;
  bio: string | null;
  avatar_url: string | null;
  specialties: string[] | null;
  certifications: string[] | null;
  studio_name: string | null;
  location: string | null;
}

function toProfile(r: CoachProfileRow): CoachProfile {
  return {
    full_name: r.full_name,
    email: r.email,
    bio: r.bio,
    avatar_url: r.avatar_url,
    // NULL (never set) and [] (explicitly emptied) both read as [] for callers.
    specialties: r.specialties ?? [],
    certifications: r.certifications ?? [],
    studio_name: r.studio_name,
    location: r.location,
  };
}

export async function getCoachProfile(
  coach_id: bigint | number,
): Promise<CoachProfile | null> {
  const rows = await sql<CoachProfileRow[]>`
    select c.full_name, u.email, c.bio, c.avatar_url,
           c.specialties, c.certifications, c.studio_name, c.location
    from coaches c
    join users u on u.id = c.user_id
    where c.id = ${Number(coach_id)}
    limit 1
  `;
  const r = rows[0];
  return r ? toProfile(r) : null;
}

/**
 * Apply a partial update to the coach's profile. Only the keys present in
 * `patch` are written (each may be null to clear). Runs in one transaction so a
 * multi-field save is atomic. Arrays are cast to text[] explicitly so an empty
 * list binds as an empty text array (not an untyped param). Returns the fresh
 * profile, or null if the coach row is gone.
 */
export async function updateCoachProfile(
  coach_id: bigint | number,
  patch: CoachProfilePatch,
): Promise<CoachProfile | null> {
  const id = Number(coach_id);

  await sql.begin(async (tx) => {
    if (patch.full_name !== undefined)
      await tx`update coaches set full_name = ${patch.full_name} where id = ${id}`;
    if (patch.bio !== undefined)
      await tx`update coaches set bio = ${patch.bio} where id = ${id}`;
    if (patch.avatar_url !== undefined)
      await tx`update coaches set avatar_url = ${patch.avatar_url} where id = ${id}`;
    if (patch.studio_name !== undefined)
      await tx`update coaches set studio_name = ${patch.studio_name} where id = ${id}`;
    if (patch.location !== undefined)
      await tx`update coaches set location = ${patch.location} where id = ${id}`;
    if (patch.specialties !== undefined)
      await tx`update coaches set specialties = ${patch.specialties}::text[] where id = ${id}`;
    if (patch.certifications !== undefined)
      await tx`update coaches set certifications = ${patch.certifications}::text[] where id = ${id}`;
    await tx`update coaches set updated_at = now() where id = ${id}`;
  });

  return getCoachProfile(id);
}
