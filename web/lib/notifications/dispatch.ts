// Notification dispatch.
//
// Single entry point used by every server-side trigger (chat send, check-in
// adaptive flag, race countdown, HRV crash, workout edit, etc.). Two effects:
//
//   1. Insert a row into `notifications` so the in-app inbox shows it.
//   2. Best-effort push to every live device of the user, over BOTH channels:
//      APNS (iPhone del atleta) and Web Push (dashboard instalado como PWA).
//      Push failure does NOT roll back the inbox row — the in-app inbox is the
//      durable channel, push is a courtesy.
//
// Un solo embudo, dos canales: cada trigger existente y futuro gana el aviso en
// el móvil del coach sin trabajo por-trigger. Quién tiene qué dispositivo lo
// deciden las tablas (apns_push_tokens / web_push_subscriptions), no el caller.

import type { Sql } from '@/lib/db';
import { sendPush } from '@/lib/push/apns';
import { sendWebPush } from '@/lib/push/webpush';

export type NotificationType =
  | 'workout_assigned'
  | 'workout_edited'
  | 'chat_message'
  | 'event_reminder'
  | 'recovery_alert'
  | 'milestone'
  | 'system'
  // Athlete-facing: weekly plan published by the publish-weekly-plans cron.
  | 'plan_published'
  // Coach inbox triggers (phase 1c):
  | 'week_adjustment_pending'
  | 'monthly_block_pending'
  | 'intake_pending';

export type DispatchInput = {
  sql: Sql;
  user_id: bigint;
  type: NotificationType;
  payload: Record<string, unknown>;
  push?: {
    title: string;
    body: string;
    // Optional thread_id, athlete_id, etc. forwarded as APS custom data so
    // the iOS app can deep-link into the right screen.
    deeplink?: Record<string, unknown>;
    badge?: number;
  };
};

/** A qué pantalla del dashboard lleva el tap en un aviso web. Rutas SIN prefijo
 *  de locale (el middleware redirige al abrir). Exportada para test: cada tipo
 *  nuevo debe caer en una pantalla que exista, nunca en un 404. */
export function webUrlForNotification(
  type: NotificationType,
  deeplink?: Record<string, unknown>,
): string {
  if (type === 'chat_message') {
    const thread = deeplink?.thread_id;
    return typeof thread === 'string' && /^\d+$/.test(thread)
      ? `/mensajes?hilo=${thread}`
      : '/mensajes';
  }
  // Los pendientes del coach (ajuste semanal, bloque mensual, intake) viven en
  // el triaje de /hoy; cualquier tipo futuro sin pantalla propia también.
  return '/hoy';
}

export async function dispatchNotification(input: DispatchInput): Promise<{ id: string }> {
  const { sql, user_id, type, payload, push } = input;
  const rows = await sql<{ id: string }[]>`
    insert into notifications (user_id, type, payload_json)
    values (${user_id as unknown as number}, ${type}::notification_type, ${JSON.stringify(payload)}::jsonb)
    returning id::text
  `;
  const id = rows[0]!.id;

  if (push) {
    // iOS routes a tapped notification on the top-level `type` key (it maps it
    // to PushNotificationKind → tab/sheet). Inject `type` alongside any deeplink
    // payload so the deep link actually fires. `type` already matches the iOS
    // enum raw values (chat_message, plan_published, week_adjustment_pending, …).
    sendPush({
      sql,
      user_id,
      title: push.title,
      body: push.body,
      deeplink: { type, ...(push.deeplink ?? {}) },
      badge: push.badge,
      category: type,
    }).catch(() => undefined);

    // Mismo aviso al dashboard instalado (PWA). El tag agrupa por hilo: dos
    // mensajes seguidos del mismo atleta sustituyen el aviso en vez de apilarse.
    const thread = push.deeplink?.thread_id;
    sendWebPush({
      sql,
      user_id,
      payload: {
        title: push.title,
        body: push.body,
        url: webUrlForNotification(type, push.deeplink),
        badge: push.badge,
        tag: type === 'chat_message' && typeof thread === 'string' ? `chat-${thread}` : type,
        type,
      },
    }).catch(() => undefined);
  }

  return { id };
}

// Convenience: notify the coach for a given athlete. Resolves the coach
// associated with the athlete via the athletes.coach_id FK.
export async function notifyCoach(args: {
  sql: Sql;
  athlete_id: bigint;
  type: NotificationType;
  payload: Record<string, unknown>;
  push?: DispatchInput['push'];
}): Promise<{ id: string } | null> {
  const { sql, athlete_id, type, payload, push } = args;
  const rows = await sql<{ user_id: string }[]>`
    select c.user_id::text as user_id
    from athletes a
    join coaches c on c.id = a.coach_id
    where a.id = ${athlete_id as unknown as number}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return dispatchNotification({
    sql,
    user_id: BigInt(row.user_id),
    type,
    payload,
    push,
  });
}

export async function notifyAthlete(args: {
  sql: Sql;
  athlete_id: bigint;
  type: NotificationType;
  payload: Record<string, unknown>;
  push?: DispatchInput['push'];
}): Promise<{ id: string } | null> {
  const { sql, athlete_id, type, payload, push } = args;
  const rows = await sql<{ user_id: string }[]>`
    select user_id::text as user_id from athletes
    where id = ${athlete_id as unknown as number}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return dispatchNotification({
    sql,
    user_id: BigInt(row.user_id),
    type,
    payload,
    push,
  });
}
