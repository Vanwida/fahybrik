// /api/push/subscriptions — alta, refresco y baja del Web Push del dashboard.
//
// Solo sesión de coach: los atletas viven en la app nativa (APNS) y no tienen
// superficie web. Cada navegador donde el coach activa los avisos registra su
// propia suscripción; el reparto por usuario lo hace `sendWebPush`.
//
//   GET    → { vapid_public_key } — null cuando el servidor no tiene claves
//            (el cliente esconde la función en vez de romperse).
//   POST   → alta/refresco. Body = PushSubscription.toJSON() del navegador.
//   DELETE → baja de ESTE navegador (por endpoint, acotada al usuario).

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { getCoachSession } from '@/lib/auth/coach-session';
import {
  deleteWebPushSubscription,
  loadVapidConfig,
  upsertWebPushSubscription,
} from '@/lib/push/webpush';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Forma exacta de PushSubscription.toJSON() (W3C Push API). Los tamaños son
// holgados: un endpoint de FCM ronda los 200 caracteres, las claves ~90/24.
const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(300),
    auth: z.string().min(1).max(100),
  }),
});

export async function GET(): Promise<NextResponse> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Coach session required', 401);
  const cfg = loadVapidConfig();
  return NextResponse.json({ vapid_public_key: cfg.ok ? cfg.config.public_key : null });
}

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Coach session required', 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('bad_request', 'Invalid JSON body', 400);
  }
  const parsed = subscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'Invalid subscription payload', 400);
  }

  await upsertWebPushSubscription({
    sql,
    user_id: session.user_id,
    subscription: {
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      user_agent: req.headers.get('user-agent'),
    },
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Coach session required', 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('bad_request', 'Invalid JSON body', 400);
  }
  const parsed = z.object({ endpoint: z.string().url().max(1000) }).safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'Invalid unsubscribe payload', 400);
  }

  const removed = await deleteWebPushSubscription({
    sql,
    user_id: session.user_id,
    endpoint: parsed.data.endpoint,
  });
  return NextResponse.json({ ok: true, removed });
}
