import { describe, expect, it } from 'vitest';
import {
  MIN_BELT_MOVING_KMH,
  beltWorkTick,
  paceSecPerKmFromKmh,
} from '@fahybrid/shared/domain/belt-work-clock';
import { lineaLecturaCinta } from '@/components/design-twin/screens/run-live/data';

describe('design-twin · cinta live: velocidad y ritmo juntos', () => {
  it('con datos se lee la velocidad de la máquina, también en 0', () => {
    expect(lineaLecturaCinta(10.5, true)).toBe('10.5 km/h en la cinta');
    expect(lineaLecturaCinta(0, true)).toBe('0.0 km/h en la cinta');
  });

  it('sin telemetría no se inventa una fila de velocidad', () => {
    expect(lineaLecturaCinta(0, false)).toBeNull();
  });

  it('en marcha se leen las dos: km/h y ritmo', () => {
    const kmh = 12;
    const velocidad = lineaLecturaCinta(kmh, true);
    const ritmo = paceSecPerKmFromKmh(kmh);
    expect(velocidad).toBe('12.0 km/h en la cinta');
    expect(ritmo).toBe(300);
    expect(velocidad && ritmo !== null).toBe(true);
  });

  it('parada se lee la velocidad y no hay ritmo', () => {
    expect(lineaLecturaCinta(0, true)).not.toBeNull();
    expect(paceSecPerKmFromKmh(0)).toBeNull();
  });
});

describe('design-twin · cinta live: el crono de trabajo espera a la banda', () => {
  it('un segundo de trabajo con la cinta parada no suma', () => {
    expect(
      beltWorkTick({
        wallDt: 1,
        surface: 'ftms',
        window: 'work',
        beltMoving: false,
      }),
    ).toBe(0);
  });

  it('un segundo de trabajo con la cinta en marcha suma', () => {
    expect(
      beltWorkTick({
        wallDt: 1,
        surface: 'ftms',
        window: 'work',
        beltMoving: true,
      }),
    ).toBe(1);
  });

  it('la calle (other) no congela el reloj si parado es true', () => {
    expect(
      beltWorkTick({
        wallDt: 1,
        surface: 'other',
        window: 'work',
        beltMoving: false,
      }),
    ).toBe(1);
  });

  it('el umbral de marcha es el de la máquina, no un 0 exacto', () => {
    expect(MIN_BELT_MOVING_KMH).toBe(0.5);
  });
});
