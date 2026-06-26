import { cookies } from 'next/headers';
import { DEMO_COACH_COOKIE } from './demo-access';

// Server-only cookie helpers for the demo coach session. Split from
// demo-access.ts (which stays edge-safe for middleware) because these use
// `next/headers`.

export async function setDemoCoachCookie(token: string, expires_at: Date): Promise<void> {
  const store = await cookies();
  store.set({
    name: DEMO_COACH_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expires_at,
  });
}

export async function clearDemoCoachCookie(): Promise<void> {
  const store = await cookies();
  store.delete(DEMO_COACH_COOKIE);
}

export async function readDemoCoachCookieToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(DEMO_COACH_COOKIE)?.value ?? null;
}
