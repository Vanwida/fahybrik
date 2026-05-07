import { sql } from '../db';
import { audiences, verifySession } from './session';

export interface AthleteSession {
  user_id: bigint;
  athlete_id: bigint;
  email: string;
  full_name: string;
  jti: string;
}

export function extractBearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export async function getAthleteSessionFromBearer(
  authorization: string | null,
): Promise<AthleteSession | null> {
  const token = extractBearerToken(authorization);
  if (!token) return null;

  const verified = await verifySession(token, audiences.athlete);
  if (!verified) return null;

  const rows = await sql<
    { user_id: string; athlete_id: string; email: string; full_name: string }[]
  >`
    select u.id::text as user_id, a.id::text as athlete_id, u.email, a.full_name
    from users u
    join athletes a on a.user_id = u.id
    where u.id = ${verified.user_id} and u.deleted_at is null
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;

  return {
    user_id: BigInt(row.user_id),
    athlete_id: BigInt(row.athlete_id),
    email: row.email,
    full_name: row.full_name,
    jti: verified.jti,
  };
}
