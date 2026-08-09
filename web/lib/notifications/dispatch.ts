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

import type postgres from 'postgres';
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
  // Athlete-facing: el coach publica un comunicado (protocolo, pregunta, tarea,
  // nota o foco) — docs/DECISIONS.md 2026-08-09.
  | 'coach_communication'
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
  // El comunicado NO tiene pestaña propia en el dashboard a propósito
  // (docs/DECISIONS.md 2026-08-09, corrección de Alex: el seguimiento vive en la
  // ficha del atleta y lo que reclama atención entra en /hoy como señal), así
  // que su aviso cae también en el triaje.
  //
  // Los pendientes del coach (ajuste semanal, bloque mensual, intake) viven en
  // el triaje de /hoy; cualquier tipo futuro sin pantalla propia también.
  return '/hoy';
}

export async function dispatchNotification(input: DispatchInput): Promise<{ id: string }> {
  const { sql, user_id, type, payload, push } = input;
  // `sql.json(...)` y NO `JSON.stringify(...)::jsonb`: con la segunda forma
  // postgres.js tipa el parámetro como jsonb por el cast y vuelve a serializar
  // la cadena, así que la columna acaba guardando un jsonb de tipo *string*
  // ("{\"kind\":…}") en vez del objeto. Con eso `payload_json->>'kind'` devuelve
  // NULL siempre, que es lo que deja sin efecto los anti-spam de
  // lib/notifications/triggers.ts y lib/citas/reviews.ts y lo que hace que la
  // bandeja del dashboard lea un payload vacío.
  const rows = await sql<{ id: string }[]>`
    insert into notifications (user_id, type, payload_json)
    values (${user_id as unknown as number}, ${type}::notification_type, ${sql.json(payload as postgres.JSONValue)})
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

/** Quién recibe lo dirigido "al coach": TODOS los miembros activos del
 *  workspace (Alex, Pablo, Gerard… — cada uno inicia sesión con SU usuario),
 *  con el usuario legacy del club como respaldo para coaches sin miembros.
 *
 *  Sin esto, el aviso iba a `coaches.user_id` — un usuario con el que ya nadie
 *  inicia sesión en la cuenta unificada — y ningún miembro lo veía jamás, ni
 *  en push ni en su bandeja. */
export async function coachRecipientUserIds(sql: Sql, coach_id: bigint): Promise<bigint[]> {
  const members = await sql<{ user_id: string }[]>`
    select user_id::text as user_id
    from coach_members
    where coach_id = ${coach_id as unknown as number}
      and removed_at is null
  `;
  if (members.length > 0) return members.map((m) => BigInt(m.user_id));
  const legacy = await sql<{ user_id: string }[]>`
    select user_id::text as user_id from coaches
    where id = ${coach_id as unknown as number}
    limit 1
  `;
  return legacy.map((r) => BigInt(r.user_id));
}

// Convenience: notify the coach for a given athlete. Resolves the coach via
// athletes.coach_id and fans out to every active member of that workspace.
export async function notifyCoach(args: {
  sql: Sql;
  athlete_id: bigint;
  type: NotificationType;
  payload: Record<string, unknown>;
  push?: DispatchInput['push'];
}): Promise<{ ids: string[] } | null> {
  const { sql, athlete_id, type, payload, push } = args;
  const rows = await sql<{ coach_id: string }[]>`
    select coach_id::text as coach_id from athletes
    where id = ${athlete_id as unknown as number}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  const recipients = await coachRecipientUserIds(sql, BigInt(row.coach_id));
  if (recipients.length === 0) return null;
  const ids: string[] = [];
  for (const user_id of recipients) {
    const { id } = await dispatchNotification({ sql, user_id, type, payload, push });
    ids.push(id);
  }
  return { ids };
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
