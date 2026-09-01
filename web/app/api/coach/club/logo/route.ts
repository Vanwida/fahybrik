import { NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getCoachSession } from '@/lib/auth/coach-session';
import { CloudflareMediaError } from '@/lib/cloudflare/api';
import { removeClubLogo } from '@/lib/coach/club-logo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DELETE /api/coach/club/logo — vuelve al icono de marca de este binario.
export async function DELETE(): Promise<NextResponse> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  try {
    await removeClubLogo(session.coach_id);
    return jsonOk({ ok: true });
  } catch (err) {
    if (err instanceof CloudflareMediaError) return jsonError(err.code, err.message, err.status);
    throw err;
  }
}
