import { getCoachSession, type CoachSession } from './coach-session';
import { jsonError } from '@/lib/api/responses';
import type { NextResponse } from 'next/server';
import type { ApiError } from '@/lib/api/responses';

export type RequireCoachResult =
  | { ok: true; session: CoachSession }
  | { ok: false; response: NextResponse<ApiError> };

export async function requireCoach(): Promise<RequireCoachResult> {
  const session = await getCoachSession();
  if (!session) {
    return {
      ok: false,
      response: jsonError('unauthorized', 'Coach session required', 401),
    };
  }
  return { ok: true, session };
}
