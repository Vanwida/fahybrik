// GET /auth/landing — adónde va alguien que acaba de entrar con Clerk.
//
// Clerk no sabe de roles: por defecto devolvía a todos a «/» (la web pública) y
// un coach tenía que buscar su panel. Aquí se decide por la sesión REAL, con la
// misma lectura que las puertas de cada superficie:
//   · coach  → /es/hoy (la casa del coach, plan §1);
//   · admin (sin panel de coach) → /es/admin;
//   · cualquier otro (atleta, cuenta sin rol) → «/». Nunca al panel: su layout
//     manda a /sign-in, y /sign-in con la sesión abierta vuelve aquí — un bucle.

import { NextResponse } from 'next/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { getAdminSession } from '@/lib/auth/admin-session';
import { landingPathFor } from '@/lib/auth/landing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const [coach, admin] = await Promise.all([
    getCoachSession().catch(() => null),
    getAdminSession().catch(() => null),
  ]);
  const path = landingPathFor({ coach: coach != null, admin: admin != null });
  return NextResponse.redirect(new URL(path, req.url));
}
