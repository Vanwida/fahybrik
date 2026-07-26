// Service worker del dashboard (PWA). Hace UNA cosa: recibir Web Push y
// pintarlo — aviso del sistema + globito en el icono + abrir la pantalla
// correcta al tocar. Sin caché offline a propósito: el dashboard es datos
// vivos y una caché a medias es peor que la red.
//
// El payload lo emite lib/push/webpush.ts (WebPushPayload). Mantener los dos
// lados del contrato a la vez.

/** Rutas de los iconos del aviso (icono grande + badge monocromo Android). */
const NOTIFICATION_ICON = '/brand/fh-coach-192.png';
const NOTIFICATION_BADGE = '/brand/fh-badge-96.png';

self.addEventListener('install', () => {
  // La versión nueva del SW entra ya, sin esperar a que mueran las pestañas.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = null;
  try {
    payload = event.data ? event.data.json() : null;
  } catch {
    payload = null;
  }
  if (!payload || !payload.title) return;

  const showPromise = self.registration.showNotification(payload.title, {
    body: payload.body || '',
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
    // Mismo tag = el aviso nuevo sustituye al anterior (dos mensajes seguidos
    // del mismo atleta no se apilan). renotify mantiene el sonido/vibración.
    tag: payload.tag || undefined,
    renotify: Boolean(payload.tag),
    data: { url: payload.url || '/hoy' },
  });

  // Globito en el icono instalado (Badging API; iOS 16.4+, Chrome/Edge).
  const badgePromise =
    'setAppBadge' in self.navigator
      ? typeof payload.badge === 'number' && payload.badge > 0
        ? self.navigator.setAppBadge(payload.badge).catch(() => undefined)
        : self.navigator.clearAppBadge().catch(() => undefined)
      : Promise.resolve();

  event.waitUntil(Promise.all([showPromise, badgePromise]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/hoy';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Si el dashboard ya está abierto, navegar esa ventana y traerla al
      // frente; si no, abrir una nueva.
      const existing = clients.find((c) => new URL(c.url).origin === self.location.origin);
      if (existing) {
        return existing.focus().then((focused) => {
          if (focused && 'navigate' in focused) return focused.navigate(url);
          return focused;
        });
      }
      return self.clients.openWindow(url);
    }),
  );
});

// El push service puede rotar la suscripción (caducidad, cambio de claves).
// Nos re-suscribimos con la misma clave de servidor y refrescamos el registro
// — sin esto, el dispositivo dejaría de recibir en silencio.
self.addEventListener('pushsubscriptionchange', (event) => {
  const oldSub = event.oldSubscription;
  if (!oldSub || !oldSub.options || !oldSub.options.applicationServerKey) return;
  event.waitUntil(
    self.registration.pushManager
      .subscribe({
        userVisibleOnly: true,
        applicationServerKey: oldSub.options.applicationServerKey,
      })
      .then((newSub) =>
        fetch('/api/push/subscriptions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(newSub.toJSON()),
        }),
      )
      .catch(() => undefined),
  );
});
