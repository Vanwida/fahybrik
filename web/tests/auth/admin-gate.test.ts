// Admin surface gate (migration 0041, now Clerk-based). getAdminSession must
// return a session ONLY when the verified Clerk login maps to a user that holds
// the admin role. A valid coach/athlete session that is NOT admin must resolve
// to null — this is the server-side hard gate behind /admin and /api/admin/*.
//
// NOTE: this gate moved from the old hand-rolled cookie + CSRF/Origin guard to
// Clerk (auth() is authentication, the DB user_roles is authorization). The
// mocks below scripts Clerk's `auth()` + the users-row SELECT + the role checks,
// so we exercise the REAL admin-session logic without loading Clerk's
// `server-only`-guarded runtime.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Scripted dependency surface of admin-session --------------------------
// Hoisted vi.mock factories reference vi.fn()s; tests reconfigure them in
// beforeEach.

const clerkAuth = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({
  auth: () => clerkAuth(),
}));

// The users-row SELECT goes through `sql` as a tagged template. Return a
// scripted row set held in a mutable closure variable.
let userRow: Array<{ user_id: string; email: string }> = [];
vi.mock('@/lib/db', () => ({
  sql: () => Promise.resolve(userRow),
}));

const hasRole = vi.fn();
const userRoles = vi.fn();
vi.mock('@/lib/auth/roles', () => ({
  hasRole: (...a: unknown[]) => hasRole(...(a as [])),
  userRoles: (...a: unknown[]) => userRoles(...(a as [])),
}));

const { getAdminSession } = await import('@/lib/auth/admin-session');

beforeEach(() => {
  clerkAuth.mockResolvedValue({ userId: 'user_clerk_7', sessionId: 'sess_1' });
  userRow = [{ user_id: '7', email: 'coach@x.com' }];
  hasRole.mockResolvedValue(false);
  userRoles.mockResolvedValue(['coach']);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('getAdminSession', () => {
  it('returns null for a valid NON-admin session (coach without admin role)', async () => {
    hasRole.mockResolvedValue(false);
    await expect(getAdminSession()).resolves.toBeNull();
  });

  it('returns the session for an admin login', async () => {
    hasRole.mockResolvedValue(true);
    userRoles.mockResolvedValue(['admin', 'coach']);
    const session = await getAdminSession();
    expect(session).not.toBeNull();
    expect(session?.email).toBe('coach@x.com');
    expect(session?.roles).toContain('admin');
    expect(session?.jti).toBe('sess_1');
  });

  it('returns null when there is no Clerk session', async () => {
    clerkAuth.mockResolvedValue({ userId: null, sessionId: null });
    await expect(getAdminSession()).resolves.toBeNull();
  });

  it('returns null when the user row is missing (deleted/unknown)', async () => {
    userRow = [];
    hasRole.mockResolvedValue(true);
    await expect(getAdminSession()).resolves.toBeNull();
  });
});
