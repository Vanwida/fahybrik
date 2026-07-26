-- FAHYBRIK migration 0138: Web Push subscriptions (dashboard PWA).
--
-- El coach no vive en el dashboard: se entera de un mensaje cuando ya es tarde.
-- El dashboard pasa a ser instalable (PWA) y cada dispositivo donde el coach
-- activa los avisos registra aquí su suscripción Web Push (RFC 8030).
--
-- Espejo deliberado de `apns_push_tokens` (0011): misma semántica de canal por
-- usuario, mismo tratamiento de tokens muertos (last_failure marca, re-suscribir
-- limpia). Un solo embudo (`dispatchNotification`) reparte a los dos canales:
-- APNS para el iPhone del atleta, Web Push para el navegador del coach — y si
-- mañana un atleta usa la web, esta tabla ya le sirve sin tocar nada.
--
-- El endpoint es único GLOBALMENTE (no por usuario): identifica UN navegador en
-- UN dispositivo. Si otra persona inicia sesión en ese navegador y activa los
-- avisos, la fila se reasigna a su user_id — el dispositivo recibe lo de quien
-- está dentro, nunca lo de quien se fue.

begin;

create table web_push_subscriptions (
  id              bigint generated always as identity primary key,
  user_id         bigint not null references users(id) on delete cascade,
  -- URL del push service del navegador (FCM, Mozilla autopush, APNs web…).
  endpoint        text not null,
  -- Claves de cifrado del navegador (RFC 8291): pública P-256 + secreto auth.
  p256dh          text not null,
  auth            text not null,
  -- Diagnóstico: qué dispositivo es ("iPhone de Pablo" se deduce del UA).
  user_agent      text,
  last_pushed_at  timestamptz,
  -- Motivo del último rechazo definitivo (410 Gone…). Non-null = muerta y se
  -- salta en el siguiente envío; re-suscribir desde ese navegador la limpia.
  last_failure    text,
  failed_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint web_push_subscriptions_endpoint_unique unique (endpoint)
);

create index web_push_subscriptions_user_idx
  on web_push_subscriptions (user_id, last_failure nulls first);

commit;
