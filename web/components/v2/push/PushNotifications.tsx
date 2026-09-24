'use client';

// Avisos del dashboard (Web Push) — las tres caras de la misma máquina:
//
//   · <PushSync>      headless, en el layout: registra el SW y refresca la
//                     suscripción si este navegador ya estaba dado de alta.
//   · <PushBanner>    en /mensajes: invita a activar (o a instalar, en iPhone)
//                     justo donde duele no enterarse. Descartable.
//   · <PushCard>      en Ajustes › Notificaciones: estado + activar/desactivar.
//
// Todo el estado se deriva DESPUÉS de montar (async): el primer render es null
// y no hay nada que hidratar distinto entre servidor y cliente.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { BellRing, X } from 'lucide-react';
import { Button, IconButton, Skeleton } from '@/components/v2/ui';
import {
  disablePush,
  enablePush,
  fetchVapidPublicKey,
  getPushState,
  syncPushSubscription,
  type PushState,
} from '@/lib/push/client';

/** Clave de "ya lo he descartado" del banner (localStorage). */
const BANNER_DISMISSED_KEY = 'fh-push-banner-dismissed';

// El "descartado" vive en localStorage (solo cliente) y se lee como store
// externo: en servidor cuenta como descartado, así que no hay nada que hidratar
// distinto. setItem no dispara el evento `storage` en la propia pestaña, por
// eso el descarte avisa a mano a los suscriptores.
const bannerListeners = new Set<() => void>();
function subscribeBannerDismissed(onChange: () => void): () => void {
  bannerListeners.add(onChange);
  return () => bannerListeners.delete(onChange);
}
function readBannerDismissed(): boolean {
  return window.localStorage.getItem(BANNER_DISMISSED_KEY) === '1';
}
function dismissBanner(): void {
  window.localStorage.setItem(BANNER_DISMISSED_KEY, '1');
  for (const listener of bannerListeners) listener();
}

type Machine =
  | { phase: 'loading' }
  | { phase: 'ready'; state: PushState; vapidKey: string | null };

function usePushMachine(): [Machine, (next: PushState) => void] {
  const [machine, setMachine] = useState<Machine>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const vapidKey = await fetchVapidPublicKey();
      const state = await getPushState(vapidKey != null);
      if (!cancelled) setMachine({ phase: 'ready', state, vapidKey });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setState = useCallback((next: PushState) => {
    setMachine((prev) => (prev.phase === 'ready' ? { ...prev, state: next } : prev));
  }, []);

  return [machine, setState];
}

/** Headless: mantiene vivo el vínculo navegador↔usuario. Va en el layout v2. */
export function PushSync() {
  useEffect(() => {
    void syncPushSubscription();
  }, []);
  return null;
}

/** Banner de /mensajes: solo aparece si hay algo que el coach pueda hacer. */
export function PushBanner() {
  const [machine, setState] = usePushMachine();
  const [busy, setBusy] = useState(false);
  const dismissed = useSyncExternalStore(subscribeBannerDismissed, readBannerDismissed, () => true);

  if (dismissed || machine.phase !== 'ready') return null;
  const { state, vapidKey } = machine;
  if (state !== 'available' && state !== 'needs-install') return null;

  // Vive en la columna de conversaciones (300px): texto arriba a lo ancho y
  // botón debajo. Todo en una fila estrangulaba el texto a una palabra por línea.
  return (
    <div role="status" className="rounded-panel border border-v2-border bg-v2-surface p-3">
      <div className="flex items-start gap-2.5">
        <BellRing aria-hidden className="mt-0.5 size-4 shrink-0 text-v2-muted" strokeWidth={1.75} />
        <p className="min-w-0 flex-1 t-body-sm text-v2-fg">
          {state === 'available' ? (
            'Recibe un aviso cuando un atleta te escriba, aunque el panel esté cerrado.'
          ) : (
            <>
              En iPhone: toca <strong>Compartir</strong> → <strong>Añadir a pantalla de inicio</strong> para poder
              recibir avisos.
            </>
          )}
        </p>
        <IconButton icon={X} label="Descartar" size="sm" onClick={dismissBanner} className="-m-1" />
      </div>
      {state === 'available' ? (
        <Button
          variant="primary"
          size="sm"
          className="mt-2.5 w-full"
          loading={busy}
          disabled={!vapidKey}
          onClick={async () => {
            if (!vapidKey) return;
            setBusy(true);
            try {
              const next = await enablePush(vapidKey);
              setState(next);
              if (next === 'enabled') dismissBanner();
            } finally {
              setBusy(false);
            }
          }}
        >
          Activar avisos
        </Button>
      ) : null}
    </div>
  );
}

const STATE_COPY: Record<Exclude<PushState, 'unsupported'>, string> = {
  enabled: 'Activados. Cuando un atleta te escriba, este navegador te avisa aunque el panel esté cerrado.',
  available: 'Desactivados. Actívalos para enterarte cuando un atleta te escriba, aunque no tengas el panel abierto.',
  denied: 'Bloqueados por el navegador. Permite las notificaciones de este sitio en los ajustes del navegador y recarga.',
  'needs-install':
    'En iPhone, los avisos necesitan el panel en la pantalla de inicio: Compartir → Añadir a pantalla de inicio, y actívalos desde ahí.',
};

/** Ajustes › Notificaciones: estado real de ESTE navegador + activar/desactivar. */
export function PushCard() {
  const [machine, setState] = usePushMachine();
  const [busy, setBusy] = useState(false);

  if (machine.phase !== 'ready') {
    return (
      <div className="flex flex-col gap-2 px-4 py-3.5" role="status" aria-label="Cargando">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-72" />
      </div>
    );
  }
  const { state, vapidKey } = machine;
  if (state === 'unsupported') {
    return (
      <div className="px-4 py-3.5 t-body-sm text-v2-muted">
        Este navegador no admite avisos. Prueba con Chrome, Edge, Firefox o Safari actualizados.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="t-body font-medium text-v2-fg">Avisos en este navegador</span>
        <p className="t-body-sm text-v2-muted">{STATE_COPY[state]}</p>
      </div>
      {state === 'available' || state === 'enabled' ? (
        <Button
          variant={state === 'enabled' ? 'secondary' : 'primary'}
          loading={busy}
          disabled={state === 'available' && !vapidKey}
          className="shrink-0"
          onClick={async () => {
            setBusy(true);
            try {
              if (state === 'enabled') {
                await disablePush();
                setState('available');
              } else if (vapidKey) {
                setState(await enablePush(vapidKey));
              }
            } finally {
              setBusy(false);
            }
          }}
        >
          {state === 'enabled' ? 'Desactivar' : 'Activar avisos'}
        </Button>
      ) : null}
    </div>
  );
}
