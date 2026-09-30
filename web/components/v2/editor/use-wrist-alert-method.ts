'use client';

// El defecto de aviso del coach (Ajustes › Método › `wrist_alert_continuous_zone`),
// leído para el editor de tramos de correr. Es el MÉTODO del coach, no una cifra
// del editor: el campo «Aviso» de un tramo dice qué pasa si no se toca, y eso lo
// manda esta posición.
//
// Se pide a la API del método (la misma que pinta Ajustes) la primera vez que un
// tramo abierto lo necesita, y se reutiliza un minuto: el editor abre y cierra
// filas todo el rato y no debe llamar al servidor en cada una, pero un cambio en
// Ajustes tiene que verse al volver. Si no se puede leer (sin sesión, sin red, o
// una superficie sin coach) devuelve null y el campo lo dice sin inventar la cifra.

import { useEffect, useState } from 'react';
import { apiJson } from '@/components/v2/shared/api';
import {
  WRIST_ALERT_DIRECTIONS,
  type WristAlertDirection,
} from '@fahybrid/shared/domain/coach/wrist-method';

const ENDPOINT = '/api/coach/signal-thresholds';
/** Lo que vale una lectura del método antes de volver a pedirla. */
const FRESH_MS = 60_000;

let cached: { at: number; value: WristAlertDirection } | null = null;
let inflight: Promise<WristAlertDirection | null> | null = null;

function load(): Promise<WristAlertDirection | null> {
  if (cached && Date.now() - cached.at < FRESH_MS) return Promise.resolve(cached.value);
  if (!inflight) {
    inflight = apiJson<{ wrist_alert_continuous_zone?: number }>(ENDPOINT)
      .then((res) => {
        const value = WRIST_ALERT_DIRECTIONS[res.wrist_alert_continuous_zone ?? -1];
        if (!value) return null;
        cached = { at: Date.now(), value };
        return value;
      })
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * El defecto de aviso del coach, o null mientras carga o si no se puede leer.
 * `enabled = false` no pide nada (un tramo que no depende del método).
 */
export function useWristAlertMethod(enabled = true): WristAlertDirection | null {
  const [value, setValue] = useState<WristAlertDirection | null>(cached?.value ?? null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void load().then((v) => {
      if (live && v) setValue(v);
    });
    return () => {
      live = false;
    };
  }, [enabled]);
  return enabled ? value : null;
}
