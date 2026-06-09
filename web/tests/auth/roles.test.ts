// Multi-role RBAC (migration 0041). user_roles is authoritative; when a user
// has NO rows there (pre-backfill account) we fall back to the legacy
// users.role single value. hasRole must never grant a role the user doesn't
// have, and the fallback must only kick in on a fully-empty user_roles set.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeSql, type SqlHandler } from '../utils/fake-sql';

let handler: SqlHandler = () => [];
vi.mock('@/lib/db', () => ({
  get sql() {
    return createFakeSql((text, values) => handler(text, values));
  },
}));

const { userRoles, hasRole, grantRole, isRole } = await import('@/lib/auth/roles');

afterEach(() => {
  handler = () => [];
});

describe('userRoles', () => {
  it('returns all roles from user_roles, deduped/filtered to the known set', async () => {
    handler = (text) => {
      if (text.includes('from user_roles')) {
        return [{ role: 'admin' }, { role: 'coach' }, { role: 'bogus' }];
      }
      return [];
    };
    const roles = await userRoles(BigInt(1));
    expect(roles.sort()).toEqual(['admin', 'coach']);
  });

  it('falls back to legacy users.role when user_roles is empty', async () => {
    handler = (text) => {
      if (text.includes('from user_roles')) return [];
      if (text.includes('from users')) return [{ role: 'athlete' }];
      return [];
    };
    const roles = await userRoles(BigInt(2));
    expect(roles).toEqual(['athlete']);
  });

  it('returns [] when neither table has the user', async () => {
    handler = () => [];
    await expect(userRoles(BigInt(3))).resolves.toEqual([]);
  });
});

describe('hasRole', () => {
  it('true when user_roles has the role', async () => {
    handler = (text, values) => {
      if (text.includes('from user_roles') && text.includes('and role =') && values[1] === 'admin') {
        return [{ ok: true }];
      }
      return [];
    };
    await expect(hasRole(BigInt(1), 'admin')).resolves.toBe(true);
  });

  it('false (no fallback) when user has SOME user_roles rows but not the asked role', async () => {
    handler = (text, values) => {
      // Direct role check misses…
      if (text.includes('and role =')) return [];
      // …but the user has rows, so the table is authoritative → must NOT fall back.
      if (text.includes('from user_roles') && values.length === 1) return [{ ok: true }];
      // Legacy fallback would (wrongly) say admin — prove we never reach it.
      if (text.includes('from users')) return [{ role: 'admin' }];
      return [];
    };
    await expect(hasRole(BigInt(1), 'admin')).resolves.toBe(false);
  });

  it('falls back to legacy users.role only when user_roles is fully empty', async () => {
    handler = (text) => {
      if (text.includes('and role =')) return [];
      if (text.includes('from user_roles')) return []; // no rows at all
      if (text.includes('from users')) return [{ role: 'coach' }];
      return [];
    };
    await expect(hasRole(BigInt(9), 'coach')).resolves.toBe(true);
    await expect(hasRole(BigInt(9), 'admin')).resolves.toBe(false);
  });
});

describe('grantRole', () => {
  it('returns true when a new row was inserted', async () => {
    handler = (text) => (text.includes('insert into user_roles') ? [{ id: '1' }] : []);
    await expect(grantRole(BigInt(1), 'coach')).resolves.toBe(true);
  });

  it('returns false on conflict (already granted)', async () => {
    handler = () => [];
    await expect(grantRole(BigInt(1), 'coach')).resolves.toBe(false);
  });
});

describe('isRole', () => {
  it('narrows known roles and rejects others', () => {
    expect(isRole('admin')).toBe(true);
    expect(isRole('coach')).toBe(true);
    expect(isRole('athlete')).toBe(true);
    expect(isRole('superuser')).toBe(false);
  });
});
