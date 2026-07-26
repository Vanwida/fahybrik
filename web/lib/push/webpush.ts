// Web Push (RFC 8030) — el canal del dashboard instalado como PWA.
//
// Espejo deliberado de `apns.ts`: mismo contrato (`sql` + `user_id` + título/
// cuerpo), misma política de tokens muertos (410 marca `last_failure`,
// re-suscribir limpia) y el mismo silencio cuando no hay credenciales (dev sin
// claves VAPID → no-op, nunca un crash). `dispatchNotification` reparte a los
// dos canales sin saber cuál tiene dispositivos el usuario.
//
// El import de `web-push` es ESTÁTICO a propósito: un import que el bundler no
// ve no viaja en el deploy (ver docs/DECISIONS.md, 26-jul-2026).
//
// Env (cargado perezoso — falta de claves solo se nota al intentar enviar):
//   * VAPID_PUBLIC_KEY   — clave pública P-256 en base64url (también la usa el
//                          navegador para suscribirse, servida por la API)
//   * VAPID_PRIVATE_KEY  — clave privada correspondiente
//   * VAPID_SUBJECT      — mailto: o https: que identifica al emisor ante el
//                          push service

import webpush, { WebPushError } from 'web-push';
import type { Sql } from '@/lib/db';
import type { NotificationType } from '@/lib/notifications/dispatch';

/** Cuánto guarda el push service un aviso si el dispositivo está offline.
 *  24 h: un "tienes un mensaje" de ayer aún vale; uno de la semana pasada no. */
const WEB_PUSH_TTL_SECONDS = 24 * 60 * 60;

type VapidConfig = {
  public_key: string;
  private_key: string;
  subject: string;
};

export function loadVapidConfig():
  | { ok: true; config: VapidConfig }
  | { ok: false; missing: string[] } {
  const public_key = process.env.VAPID_PUBLIC_KEY;
  const private_key = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  const missing: string[] = [];
  if (!public_key) missing.push('VAPID_PUBLIC_KEY');
  if (!private_key) missing.push('VAPID_PRIVATE_KEY');
  if (!subject) missing.push('VAPID_SUBJECT');
  if (missing.length > 0) return { ok: false, missing };
  return { ok: true, config: { public_key: public_key!, private_key: private_key!, subject: subject! } };
}

/** Lo que viaja dentro del push y consume `public/sw.js`. Mantener los dos
 *  lados de este contrato a la vez. */
export type WebPushPayload = {
  title: string;
  body: string;
  /** Ruta del dashboard que abre el tap. Sin prefijo de locale: el middleware
   *  redirige a /es/... al abrir. */
  url: string;
  /** Contador para el globito del icono instalado (Badging API). */
  badge?: number;
  /** Agrupa avisos del mismo origen (p. ej. un hilo): el nuevo sustituye al
   *  viejo en vez de apilarse. */
  tag?: string;
  type: NotificationType;
};

export type WebPushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string | null;
};

/** Alta o refresco de la suscripción de UN navegador. El endpoint identifica el
 *  navegador, no a la persona: si otro usuario entra en ese navegador y activa
 *  los avisos, la fila se reasigna y el dispositivo deja de recibir lo del
 *  usuario anterior. Re-suscribir siempre limpia el estado de fallo. */
export async function upsertWebPushSubscription(args: {
  sql: Sql;
  user_id: bigint;
  subscription: WebPushSubscriptionInput;
}): Promise<{ id: string }> {
  const { sql, user_id, subscription } = args;
  const rows = await sql<{ id: string }[]>`
    insert into web_push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    values (
      ${user_id as unknown as number},
      ${subscription.endpoint},
      ${subscription.p256dh},
      ${subscription.auth},
      ${subscription.user_agent ?? null}
    )
    on conflict (endpoint) do update set
      user_id = excluded.user_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      user_agent = excluded.user_agent,
      last_failure = null,
      failed_at = null,
      updated_at = now()
    returning id::text
  `;
  return { id: rows[0]!.id };
}

/** Baja explícita (el usuario apaga los avisos en ese navegador). Acotada al
 *  dueño: nadie borra la suscripción de otro conociendo su endpoint. */
export async function deleteWebPushSubscription(args: {
  sql: Sql;
  user_id: bigint;
  endpoint: string;
}): Promise<boolean> {
  const rows = await args.sql<{ id: string }[]>`
    delete from web_push_subscriptions
    where endpoint = ${args.endpoint}
      and user_id = ${args.user_id as unknown as number}
    returning id::text
  `;
  return rows.length > 0;
}

export type WebPushSendResult = {
  attempted: number;
  sent: number;
  failed: number;
  errors: Array<{ endpoint_host: string; reason: string }>;
};

/** Envía a TODOS los navegadores vivos del usuario. Falla en silencio por
 *  suscripción (el push es cortesía; la bandeja in-app es el canal durable) y
 *  marca muertas las que el push service da por desaparecidas (404/410). */
export async function sendWebPush(args: {
  sql: Sql;
  user_id: bigint;
  payload: WebPushPayload;
}): Promise<WebPushSendResult> {
  const result: WebPushSendResult = { attempted: 0, sent: 0, failed: 0, errors: [] };
  const cfg = loadVapidConfig();
  if (!cfg.ok) return result; // sin claves VAPID (dev) → no-op, como APNS

  const subs = await args.sql<
    { id: string; endpoint: string; p256dh: string; auth: string }[]
  >`
    select id::text, endpoint, p256dh, auth
    from web_push_subscriptions
    where user_id = ${args.user_id as unknown as number}
      and last_failure is null
  `;
  if (subs.length === 0) return result;

  const body = JSON.stringify(args.payload);

  for (const s of subs) {
    result.attempted += 1;
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
        {
          vapidDetails: {
            subject: cfg.config.subject,
            publicKey: cfg.config.public_key,
            privateKey: cfg.config.private_key,
          },
          TTL: WEB_PUSH_TTL_SECONDS,
          urgency: 'high',
        },
      );
      result.sent += 1;
      await args.sql`
        update web_push_subscriptions
        set last_pushed_at = now(), updated_at = now()
        where id = ${s.id}::bigint
      `;
    } catch (err) {
      result.failed += 1;
      const status = err instanceof WebPushError ? err.statusCode : null;
      const reason = status != null ? `http_${status}` : err instanceof Error ? err.message : 'unknown_error';
      result.errors.push({ endpoint_host: hostOf(s.endpoint), reason });
      // 404/410 = el push service ya no conoce ese endpoint → muerta.
      if (status === 404 || status === 410) {
        await args.sql`
          update web_push_subscriptions
          set last_failure = ${reason}, failed_at = now(), updated_at = now()
          where id = ${s.id}::bigint
        `;
      }
    }
  }

  return result;
}

function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return 'invalid-endpoint';
  }
}
