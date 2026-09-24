'use client';

// El huso del coach en el cliente. El layout del panel lo lee UNA vez
// (`loadCoachTimezone`) y lo reparte por contexto, así que los relojes del panel
// (chat, mensajes, citas, pagos, métricas…) pintan la hora del club y no la de
// Madrid ni la del navegador — y el HTML del servidor coincide con el del cliente.

import { createContext, useContext, type ReactNode } from 'react';
import { BOX_TIMEZONE } from '@fahybrid/shared/domain/dates';

const CoachTimeZoneContext = createContext<string>(BOX_TIMEZONE);

export function CoachTimeZoneProvider({ tz, children }: { tz: string; children: ReactNode }) {
  return <CoachTimeZoneContext.Provider value={tz}>{children}</CoachTimeZoneContext.Provider>;
}

/** El huso del coach de la sesión (sin proveedor, el defecto del producto). */
export function useCoachTimeZone(): string {
  return useContext(CoachTimeZoneContext);
}

const cache = new Map<string, Intl.DateTimeFormat>();

/** Un `Intl.DateTimeFormat` en el huso dado, reutilizado entre renders. */
export function zonedFormat(tz: string, locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${tz}|${locale}|${JSON.stringify(options)}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { ...options, timeZone: tz });
    cache.set(key, f);
  }
  return f;
}
