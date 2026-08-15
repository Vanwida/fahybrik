'use client';

// Avisos del dashboard (Web Push) — las tres caras de la misma máquina:
//
//   · <PushSync>      headless, en el layout: registra el SW y refresca la
//                     suscripción si este navegador ya estaba dado de alta.
//   · <PushBanner>    en /mensajes: invita a activar (o a instalar, en iPhone)
//                     justo donde duele no enterarse. Descartable.
//   · <PushCard>      en /ajustes: estado + activar/desactivar del dispositivo.
//
// Todo el estado se deriva DESPUÉS de montar (async): el primer render es null
// y no hay nada que hidratar distinto entre servidor y cliente.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { Card } from '@/components/ui/card';
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

  const dismiss = dismissBanner;

  // Vive en la columna de conversaciones (300px): texto arriba a lo ancho y
  // botón debajo. Todo en una fila estrangulaba el texto a una palabra por línea.
  return (
    <div
      role="status"
      className="rounded-[var(--v2-r-m)] border border-[color:color-mix(in_srgb,var(--v2-accent)_35%,var(--v2-border))] bg-[color:color-mix(in_srgb,var(--v2-accent)_8%,var(--v2-surface))] p-3"
    >
      <div className="flex items-start gap-2.5">
        <MIcon
          name="notifications_active"
          size={18}
          className="mt-0.5 shrink-0 text-[color:var(--v2-accent)]"
        />
        <p className="min-w-0 flex-1 text-body leading-snug text-[color:var(--v2-fg)]">
          {state === 'available' ? (
            'Recibe un aviso cuando un atleta te escriba, aunque el dashboard esté cerrado.'
          ) : (
            <>
              En iPhone: toca <strong>Compartir</strong> → <strong>Añadir a pantalla de inicio</strong>{' '}
              para poder recibir avisos.
            </>
          )}
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Descartar"
          className="v2-focus -m-1 shrink-0 rounded-[var(--v2-r-s)] p-1 text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
        >
          <MIcon name="close" size={16} />
        </button>
      </div>
      {state === 'available' ? (
        <button
          type="button"
          disabled={busy || !vapidKey}
          onClick={async () => {
            if (!vapidKey) return;
            setBusy(true);
            try {
              const next = await enablePush(vapidKey);
              setState(next);
              if (next === 'enabled') dismiss();
            } finally {
              setBusy(false);
            }
          }}
          className="v2-focus mt-2.5 w-full rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 py-1.5 text-body font-semibold text-[color:var(--v2-accent-fg)] transition-opacity disabled:opacity-60"
        >
          {busy ? 'Activando…' : 'Activar avisos'}
        </button>
      ) : null}
    </div>
  );
}

/** Sección de /ajustes: estado real del dispositivo + activar/desactivar. */
export function PushCard() {
  const [machine, setState] = usePushMachine();
  const [busy, setBusy] = useState(false);

  // Sin soporte (o sin claves en el servidor) no hay nada que ajustar: mejor
  // ninguna sección que una sección muerta.
  if (machine.phase !== 'ready' || machine.state === 'unsupported') return null;
  const { state, vapidKey } = machine;

  return (
    <section>
      <h2 className="v2-micro mb-2">Avisos en este dispositivo</h2>
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <MIcon
            name={state === 'enabled' ? 'notifications_active' : 'notifications'}
            size={20}
            className={
              state === 'enabled'
                ? 'mt-0.5 shrink-0 text-[color:var(--v2-accent)]'
                : 'mt-0.5 shrink-0 text-[color:var(--v2-muted)]'
            }
          />
          <p className="text-sm text-[color:var(--v2-fg)]">
            {state === 'enabled' &&
              'Activados: cuando un atleta te escriba, este dispositivo te avisa aunque el dashboard esté cerrado.'}
            {state === 'available' &&
              'Recibe un aviso cuando un atleta te escriba, aunque no tengas el dashboard abierto.'}
            {state === 'denied' &&
              'Los avisos están bloqueados en este navegador. Desbloquéalos en los ajustes del navegador y recarga la página.'}
            {state === 'needs-install' && (
              <>
                En iPhone los avisos requieren tener el dashboard en la pantalla de inicio: toca{' '}
                <strong>Compartir</strong> y elige <strong>Añadir a pantalla de inicio</strong>.
                Luego actívalos desde ahí.
              </>
            )}
          </p>
        </div>
        {(state === 'available' || state === 'enabled') && (
          <div>
            <button
              type="button"
              disabled={busy || (state === 'available' && !vapidKey)}
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
              className={
                state === 'enabled'
                  ? 'v2-focus inline-flex items-center gap-2 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-4 py-2.5 text-sm font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-accent)] disabled:opacity-60'
                  : 'v2-focus inline-flex items-center gap-2 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 py-2.5 text-sm font-semibold text-[color:var(--v2-accent-fg)] transition-opacity disabled:opacity-60'
              }
            >
              {busy
                ? 'Un momento…'
                : state === 'enabled'
                  ? 'Desactivar en este dispositivo'
                  : 'Activar avisos'}
            </button>
          </div>
        )}
      </Card>
    </section>
  );
}
