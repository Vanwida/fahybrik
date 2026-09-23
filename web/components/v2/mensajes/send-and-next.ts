'use client';

// «Enviar y siguiente» — en «Por responder», contestar un hilo abre el siguiente
// que espera (lo mismo que hace «Hecho» con el cursor, pero abriéndolo: acabas de
// escribir, lo siguiente es escribir al próximo). Preferencia de cada coach en
// este navegador, activada por defecto: es una comodidad de pantalla, no un dato.

import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'fahybrid:mensajes-enviar-y-siguiente';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

/** El hilo que toca después de contestar `currentId`: el de debajo; si era el
 *  último, el de encima; si no queda nadie, `null`. */
export function nextAfterSend<T extends { athlete_id: string }>(visible: readonly T[], currentId: string): T | null {
  const i = visible.findIndex((t) => t.athlete_id === currentId);
  if (i === -1) return visible[0] ?? null;
  return visible[i + 1] ?? visible[i - 1] ?? null;
}

export function useSendAndNext(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => true,
  );
  const set = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(KEY, next ? '1' : '0');
    } catch {
      // Sin almacenamiento, la preferencia dura lo que la pestaña… o nada: da igual.
    }
    listeners.forEach((l) => l());
  }, []);
  return [on, set];
}
