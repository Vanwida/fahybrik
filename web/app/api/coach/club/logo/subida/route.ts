import { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getCoachSession } from '@/lib/auth/coach-session';
import { CloudflareMediaError } from '@/lib/cloudflare/api';
import { reserveClubLogoUpload } from '@/lib/coach/club-logo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const subidaSchema = z.object({ filename: z.string().min(1).max(300) }).strict();

// POST /api/coach/club/logo/subida — reserva en Cloudflare Images. Los bytes
// no pasan por aquí. coach_id sale de la sesión.
export async function POST(request: Request): Promise<NextResponse> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }
  const parsed = subidaSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('bad_request', 'Se esperaba { filename }', 400, parsed.error.flatten());
  }

  try {
    const target = await reserveClubLogoUpload({
      coach_id: session.coach_id,
      filename: parsed.data.filename,
    });
    return jsonOk(target, 201);
  } catch (err) {
    if (err instanceof CloudflareMediaError) return jsonError(err.code, err.message, err.status);
    throw err;
  }
}
