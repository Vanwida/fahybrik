import { cookies } from 'next/headers';
import { sql } from '../db';
import { AUTH_CONFIG } from './config';
import { audiences, revokeSession, verifySession } from './session';

export interface CoachSession {
  user_id: bigint;
  coach_id: bigint;
  email: string;
  full_name: string;
  jti: string;
}

export async function getCoachSession(): Promise<CoachSession | null> {
  const store = await cookies();
  const cookie = store.get(AUTH_CONFIG.coachCookieName);
  if (!cookie?.value) return null;

  const verified = await verifySession(cookie.value, audiences.coach);
  if (!verified) return null;

  const rows = await sql<
    { user_id: string; coach_id: string; email: string; full_name: string }[]
  >`
    select u.id::text as user_id, c.id::text as coach_id, u.email, c.full_name
    from users u
    join coaches c on c.user_id = u.id
    where u.id = ${verified.user_id} and u.deleted_at is null
    limit 1
  `;

  const row = rows[0];
  if (!row) return null;

  return {
    user_id: BigInt(row.user_id),
    coach_id: BigInt(row.coach_id),
    email: row.email,
    full_name: row.full_name,
    jti: verified.jti,
  };
}

export async function clearCoachSession(): Promise<void> {
  const store = await cookies();
  const existing = store.get(AUTH_CONFIG.coachCookieName);
  if (existing?.value) {
    const verified = await verifySession(existing.value, audiences.coach);
    if (verified) {
      await revokeSession(verified.jti);
    }
  }
  store.delete(AUTH_CONFIG.coachCookieName);
}

export interface CoachCookieOptions {
  token: string;
  expires_at: Date;
}

export async function setCoachSessionCookie(opts: CoachCookieOptions): Promise<void> {
  const store = await cookies();
  store.set({
    name: AUTH_CONFIG.coachCookieName,
    value: opts.token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: opts.expires_at,
  });
}
