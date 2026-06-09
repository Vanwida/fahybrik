import { redirect } from 'next/navigation';

// Legacy coach sign-in (magic link / demo). There is now ONE login surface:
// Clerk at `/sign-in`. This route stays only as a permanent redirect so any
// stale link, bookmark, or old client lands on the canonical Clerk page.
//
// TODO Fase 3: remove legacy auth (magic-link.ts, demo-login.ts, session.ts,
// apple.ts) and this redirect once nothing points at /auth/sign-in.

export default function LegacySignInRedirect(): never {
  redirect('/sign-in');
}
