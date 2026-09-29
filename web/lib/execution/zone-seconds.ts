// Time in heart-rate zones per segment, stored under the `zone_seconds` key of
// `segment_executions.raw_lap_data_json` (the same jsonb blob that carries the
// erg detail — see `erg-splits.ts`, its sibling reader).
//
// iOS computes it from the segment's HR samples and posts it as
// `segments[].zone_seconds_json`; the ingest writes it through verbatim as long
// as it fits the tramo's window (`fitZoneSecondsToWindow`, below): a split with
// more seconds than the tramo lived is not that tramo's measurement. This module
// is the single reader.
//
// Never throws: a null column, a blob with no zones, a double-encoded string or
// a shape we don't recognise all yield null — "no zone data", never a guess.

import { z } from 'zod';

export const ZONE_KEYS = ['z1', 'z2', 'z3', 'z4', 'z5'] as const;
export type ZoneKey = (typeof ZONE_KEYS)[number];

/** Seconds spent in each zone. Always all five keys — see `parseZoneSeconds`. */
export type ZoneSeconds = Record<ZoneKey, number>;

// Every zone optional on the way in: the engine emits only the zones the athlete
// actually visited. Unknown keys are stripped, so a blob holding the erg detail
// alongside parses to no zones rather than failing.
const seconds = z.number().finite().nonnegative().nullish();
const zoneSecondsSchema = z.object({
  z1: seconds,
  z2: seconds,
  z3: seconds,
  z4: seconds,
  z5: seconds,
});

/**
 * Read the per-zone seconds out of a `raw_lap_data_json` value. Returns all five
 * zones or null.
 *
 * An absent zone becomes 0, which is the TRUTH and not a fabrication: the engine
 * partitions the whole segment across the five bands, so a missing band is one
 * the athlete spent no time in. Filling it keeps the payload a fixed shape iOS
 * can decode as a struct. A blob carrying NO zone at all is a different thing —
 * nothing was measured — and yields null.
 */
export function parseZoneSeconds(raw: unknown): ZoneSeconds | null {
  if (raw == null) return null;
  let value: unknown = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof value !== 'object' || value === null) return null;

  const parsed = zoneSecondsSchema.safeParse((value as Record<string, unknown>).zone_seconds);
  if (!parsed.success) return null;

  const measured = ZONE_KEYS.some((k) => parsed.data[k] != null);
  if (!measured) return null;

  return Object.fromEntries(ZONE_KEYS.map((k) => [k, parsed.data[k] ?? 0])) as ZoneSeconds;
}

/**
 * La holgura del redondeo, en segundos enteros. El móvil redondea cada zona al
 * segundo (cinco zonas × 0,5 s) y sella el inicio y el fin del tramo al segundo
 * (menos de 1 s de error en la ventana): juntos no llegan a 3,5 s. Un reparto que
 * se pasa de la ventana en 4 s o más no es redondeo: contó tiempo de fuera del
 * tramo. Es mecanismo (aritmética del reloj), no método de ningún coach.
 */
export const ZONE_WINDOW_SLACK_S = 3;

/**
 * El reparto congelado frente a la ventana de SU tramo. Un tramo no puede tener
 * más segundos en zona que segundos de vida:
 *   - cabe → tal cual, al segundo;
 *   - se pasa por redondeo (hasta `ZONE_WINDOW_SLACK_S`) → se recorta a la
 *     ventana, repartiendo el recorte en proporción (restos mayores);
 *   - se pasa de verdad → null. No es la medida de ESTE tramo: arrastró el tiempo
 *     de otro (el móvil reiniciaba el reloj del tramo sin vaciar sus zonas), y quien
 *     lo lee lo trata como «no hay reparto congelado».
 *
 * Una ventana rota (fin = inicio) vale cero: el propio móvil dijo que el tramo no
 * duró nada, así que tampoco pudo pasar tiempo en ninguna zona.
 */
export function fitZoneSecondsToWindow(zones: ZoneSeconds, windowSeconds: number): ZoneSeconds | null {
  const window = Math.max(0, Math.round(Number.isFinite(windowSeconds) ? windowSeconds : 0));
  const whole = Object.fromEntries(
    ZONE_KEYS.map((k) => [k, Math.max(0, Math.round(zones[k]))]),
  ) as ZoneSeconds;
  const measured = ZONE_KEYS.reduce((sum, k) => sum + whole[k], 0);
  if (measured <= window) return whole;
  if (measured - window > ZONE_WINDOW_SLACK_S) return null;

  // Recorte proporcional al segundo: suelo de cada parte y los segundos que faltan
  // a las de mayor resto (empate: la zona más baja, para que sea determinista).
  const scale = window / measured;
  const exact = ZONE_KEYS.map((k) => ({ k, v: whole[k] * scale }));
  const out = Object.fromEntries(exact.map(({ k, v }) => [k, Math.floor(v)])) as ZoneSeconds;
  let left = window - ZONE_KEYS.reduce((sum, k) => sum + out[k], 0);
  const byRemainder = [...exact].sort((a, b) => b.v - Math.floor(b.v) - (a.v - Math.floor(a.v)));
  for (const { k } of byRemainder) {
    if (left <= 0) break;
    out[k] += 1;
    left -= 1;
  }
  return out;
}

/**
 * La puerta de ESCRITURA: el `zone_seconds_json` de un tramo que llega del móvil,
 * contra la ventana que el propio tramo declara. Lo que no se deja leer como
 * reparto (otra forma, p. ej. las filas de una captura) no se puede contradecir
 * con la ventana y pasa como siempre; una ventana ilegible tampoco juzga nada.
 */
export function frozenZonesFitTramo(
  zoneSecondsJson: unknown,
  startedAtIso: string,
  endedAtIso: string,
): { fits: true } | { fits: false; measured_s: number; window_s: number } {
  const zones = parseZoneSeconds({ zone_seconds: zoneSecondsJson });
  if (zones == null) return { fits: true };
  const windowS = (Date.parse(endedAtIso) - Date.parse(startedAtIso)) / 1000;
  if (!Number.isFinite(windowS)) return { fits: true };
  if (fitZoneSecondsToWindow(zones, windowS) != null) return { fits: true };
  return {
    fits: false,
    measured_s: Math.round(ZONE_KEYS.reduce((sum, k) => sum + zones[k], 0)),
    window_s: Math.max(0, Math.round(windowS)),
  };
}
