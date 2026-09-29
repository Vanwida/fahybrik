// Un tramo no puede tener más segundos en zona que segundos de vida (0278).
//
// Producción, 29-09-2026: ocho tramos del atleta 64 con el reparto congelado del
// móvil más largo que su ventana — 1.029 s en un tramo de 690 s (el tramo heredó
// las zonas del que el atleta dejó al saltar de bloque), 184 s en 180 s (la espera
// a que arrancara la cinta), y cinco con la ventana rota (fin = inicio) y hasta
// 565 s dentro. El redondeo honrado del móvil, en cambio, se pasa como mucho en
// 3 s y se recorta.

import { describe, expect, it } from 'vitest';
import {
  ZONE_WINDOW_SLACK_S,
  fitZoneSecondsToWindow,
  frozenZonesFitTramo,
  type ZoneSeconds,
} from '@/lib/execution/zone-seconds';

const zones = (z: Partial<ZoneSeconds>): ZoneSeconds => ({ z1: 0, z2: 0, z3: 0, z4: 0, z5: 0, ...z });
const total = (z: ZoneSeconds) => z.z1 + z.z2 + z.z3 + z.z4 + z.z5;

describe('fitZoneSecondsToWindow', () => {
  it('un reparto que cabe pasa tal cual', () => {
    expect(fitZoneSecondsToWindow(zones({ z1: 100, z2: 400, z3: 50 }), 600)).toEqual(
      zones({ z1: 100, z2: 400, z3: 50 }),
    );
  });

  it('el redondeo del móvil (hasta la holgura) se recorta a la ventana exacta', () => {
    const fitted = fitZoneSecondsToWindow(zones({ z1: 65, z2: 55, z3: 63 }), 180);
    expect(fitted).not.toBeNull();
    expect(total(fitted!)).toBe(180);
    // El recorte es proporcional: ninguna zona cambia más de un par de segundos.
    expect(Math.abs(fitted!.z1 - 65)).toBeLessThanOrEqual(2);
    expect(Math.abs(fitted!.z3 - 63)).toBeLessThanOrEqual(2);
  });

  it('pasarse más que la holgura no es redondeo: no es la medida del tramo', () => {
    expect(ZONE_WINDOW_SLACK_S).toBe(3);
    // 2641 · la espera de la cinta: 184 s en un tramo de 180 s.
    expect(fitZoneSecondsToWindow(zones({ z1: 65, z2: 55, z3: 64 }), 180)).toBeNull();
    // 2678 · las zonas del tramo que se dejó al saltar de bloque.
    expect(fitZoneSecondsToWindow(zones({ z1: 939, z2: 61, z5: 29 }), 690)).toBeNull();
  });

  it('una ventana rota (fin = inicio) no puede llevar zonas', () => {
    expect(fitZoneSecondsToWindow(zones({ z1: 565 }), 0)).toBeNull();
    expect(fitZoneSecondsToWindow(zones({ z1: 2 }), 0)).toEqual(zones({}));
  });

  it('los decimales se redondean al segundo antes de juzgar', () => {
    expect(fitZoneSecondsToWindow(zones({ z2: 99.6, z3: 0.4 }), 100)).toEqual(zones({ z2: 100 }));
  });
});

describe('frozenZonesFitTramo — la puerta de escritura', () => {
  const start = '2026-09-10T09:21:11Z';
  const end = '2026-09-10T09:32:41Z'; // 690 s

  it('deja pasar un reparto que cabe en la ventana que el tramo declara', () => {
    expect(frozenZonesFitTramo({ z1: 300, z2: 390 }, start, end)).toEqual({ fits: true });
  });

  it('rechaza el que se pasa y dice cuánto', () => {
    expect(frozenZonesFitTramo({ z1: 939, z2: 61, z5: 29 }, start, end)).toEqual({
      fits: false,
      measured_s: 1029,
      window_s: 690,
    });
  });

  it('lo que no es un reparto (otra forma) no se juzga', () => {
    expect(frozenZonesFitTramo([{ zone: 2, seconds: 900 }], start, start)).toEqual({ fits: true });
    expect(frozenZonesFitTramo(null, start, start)).toEqual({ fits: true });
  });
});
