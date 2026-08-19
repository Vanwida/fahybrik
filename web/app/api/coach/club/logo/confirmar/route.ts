import { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getCoachSession } from '@/lib/auth/coach-session';
import { CloudflareMediaError } from '@/lib/cloudflare/api';
import { confirmClubLogo } from '@/lib/coach/club-logo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const confirmarSchema = z.object({ image_id: z.string().uuid() }).strict();

// POST /api/coach/club/logo/confirmar — pregunta a Cloudflare y entonces escribe
// coaches.club_logo_url. El cliente manda el id, nunca la URL.
export async function POST(request: Request): Promise<NextResponse> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }
  const parsed = confirmarSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('bad_request', 'Se esperaba { image_id }', 400, parsed.error.flatten());
  }

  try {
    return jsonOk(
      await confirmClubLogo({ coach_id: session.coach_id, image_id: parsed.data.image_id }),
    );
  } catch (err) {
    if (err instanceof CloudflareMediaError) return jsonError(err.code, err.message, err.status);
    throw err;
  }
}
