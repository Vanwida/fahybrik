// Web Push desde el navegador — registro del SW, alta/baja y estado.
//
// Módulo SOLO de cliente (usa navigator/window); lo consumen los componentes
// de ajustes y el banner de mensajes. El servidor tiene su espejo en
// lib/push/webpush.ts.

/** En qué punto está ESTE navegador respecto a los avisos. */
export type PushState =
  /** El navegador no soporta Web Push (o no hay claves en el servidor). */
  | 'unsupported'
  /** iPhone/iPad con Safari sin instalar: el push solo existe si la web está
   *  añadida a la pantalla de inicio (iOS 16.4+). */
  | 'needs-install'
  /** El usuario bloqueó los avisos; solo se deshace en ajustes del navegador. */
  | 'denied'
  /** Activado y suscrito en este navegador. */
  | 'enabled'
  /** Se puede activar (falta pedir permiso y suscribir). */
  | 'available';

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  // iPadOS se anuncia como Mac con touch; el resto de iOS lleva iPhone/iPad.
  const isIos =
    /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return isIos;
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari clásico expone navigator.standalone fuera del estándar.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Registra el SW (idempotente: el navegador reutiliza el registro). */
export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
}

/** Estado actual de este navegador. `vapidAvailable` viene del GET a la API:
 *  sin claves en el servidor la función entera se esconde. */
export async function getPushState(vapidAvailable: boolean): Promise<PushState> {
  if (!vapidAvailable) return 'unsupported';
  if (!pushSupported()) {
    // En iOS el soporte EXISTE pero solo dentro de la web instalada.
    return isIosSafari() && !isStandalone() ? 'needs-install' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  const registration = await registerPushServiceWorker();
  if (!registration) return 'unsupported';
  const sub = await registration.pushManager.getSubscription();
  return sub ? 'enabled' : 'available';
}

/** La clave pública VAPID viaja en base64url; subscribe() la quiere en bytes. */
export function vapidKeyToBytes(base64url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch('/api/push/subscriptions', { credentials: 'include' });
    if (!res.ok) return null;
    const data = (await res.json()) as { vapid_public_key?: string | null };
    return data.vapid_public_key ?? null;
  } catch {
    return null;
  }
}

/** Pide permiso, suscribe este navegador y lo registra en el servidor.
 *  Devuelve el estado resultante (enabled | denied | unsupported). */
export async function enablePush(vapidPublicKey: string): Promise<PushState> {
  const registration = await registerPushServiceWorker();
  if (!registration) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'available';

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKeyToBytes(vapidPublicKey) as unknown as BufferSource,
    }));

  const res = await fetch('/api/push/subscriptions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!res.ok) {
    // El servidor no lo aceptó: deshacer la suscripción local para no dejar un
    // navegador suscrito que el servidor no conoce.
    await subscription.unsubscribe().catch(() => undefined);
    return 'available';
  }
  return 'enabled';
}

/** Apaga los avisos en este navegador (local + servidor). */
export async function disablePush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe().catch(() => undefined);
  await fetch('/api/push/subscriptions', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ endpoint }),
  }).catch(() => undefined);
}

/** Refresco silencioso al cargar el dashboard: si este navegador ya está
 *  suscrito, re-registra la suscripción (mantiene vivo el vínculo con el
 *  usuario actual y refresca claves rotadas). */
export async function syncPushSubscription(): Promise<void> {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const registration = await registerPushServiceWorker();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await fetch('/api/push/subscriptions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(subscription.toJSON()),
  }).catch(() => undefined);
}

/** Limpia el globito del icono (al entrar a mensajes ya lo has visto). */
export function clearAppBadge(): void {
  if ('clearAppBadge' in navigator) {
    (navigator as unknown as { clearAppBadge: () => Promise<void> })
      .clearAppBadge()
      .catch(() => undefined);
  }
}
