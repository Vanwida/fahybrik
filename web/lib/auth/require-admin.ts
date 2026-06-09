import { getAdminSession, type AdminSession } from './admin-session';
import { jsonError } from '@/lib/api/responses';
import type { NextResponse } from 'next/server';
import type { ApiError } from '@/lib/api/responses';

export type RequireAdminResult =
  | { ok: true; session: AdminSession }
  | { ok: false; response: NextResponse<ApiError> };

/**
 * Server-side admin gate for /api/admin/* routes. Returns 404 (not 403) when
 * the caller is not an admin so the existence of the admin API isn't disclosed
 * to a non-admin coach/athlete.
 */
export async function requireAdmin(): Promise<RequireAdminResult> {
  const session = await getAdminSession();
  if (!session) {
    return {
      ok: false,
      response: jsonError('not_found', 'Not found', 404),
    };
  }
  return { ok: true, session };
}
