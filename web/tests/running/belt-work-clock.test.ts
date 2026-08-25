import { describe, expect, it } from 'vitest';
import {
  MIN_BELT_MOVING_KMH,
  beltIsMoving,
  beltWorkApplies,
  beltWorkTick,
  paceSecPerKmFromKmh,
} from '@fahybrid/shared/domain/belt-work-clock';

describe('beltIsMoving', () => {
  it('sin lectura no está en marcha', () => {
    expect(beltIsMoving(null)).toBe(false);
    expect(beltIsMoving(undefined)).toBe(false);
    expect(beltIsMoving(0)).toBe(false);
  });

  it('en el umbral o por debajo la banda está parada', () => {
    expect(beltIsMoving(MIN_BELT_MOVING_KMH)).toBe(false);
    expect(beltIsMoving(0.4)).toBe(false);
  });

  it('por encima del umbral está en marcha', () => {
    expect(beltIsMoving(0.51)).toBe(true);
    expect(beltIsMoving(10)).toBe(true);
  });
});

describe('beltWorkTick — arranque y parada', () => {
  const workFtms = {
    wallDt: 0.25,
    surface: 'ftms' as const,
    window: 'work' as const,
  };

  it('no suma trabajo si la cinta FTMS no manda velocidad', () => {
    expect(beltWorkTick({ ...workFtms, beltMoving: false })).toBe(0);
  });

  it('suma el latido cuando la cinta manda velocidad', () => {
    expect(beltWorkTick({ ...workFtms, beltMoving: true })).toBe(0.25);
  });

  it('sin feed FTMS (null) no se aplica: el reloj de pared sigue', () => {
    expect(beltWorkTick({ ...workFtms, beltMoving: null })).toBe(0.25);
    expect(beltWorkApplies({ ...workFtms, beltMoving: null })).toBe(false);
  });

  it('la recuperación de cinta corre en pared, banda parada o no', () => {
    expect(
      beltWorkTick({ wallDt: 1, surface: 'ftms', window: 'recovery', beltMoving: false }),
    ).toBe(1);
  });

  it('la cuenta atrás 3-2-1 no espera a la banda', () => {
    expect(
      beltWorkTick({ wallDt: 1, surface: 'ftms', window: 'count_in', beltMoving: false }),
    ).toBe(1);
  });

  it('un EMOM / AMRAP (format) no se congela si la cinta para', () => {
    expect(
      beltWorkTick({ wallDt: 1, surface: 'ftms', window: 'format', beltMoving: false }),
    ).toBe(1);
  });

  it('calle o cinta tonta no se enganchan a este reloj', () => {
    expect(
      beltWorkTick({ wallDt: 1, surface: 'other', window: 'work', beltMoving: false }),
    ).toBe(1);
  });
});

describe('paceSecPerKmFromKmh', () => {
  it('10 km/h es 6:00/km', () => {
    expect(paceSecPerKmFromKmh(10)).toBe(360);
  });

  it('parado no inventa ritmo', () => {
    expect(paceSecPerKmFromKmh(0)).toBeNull();
    expect(paceSecPerKmFromKmh(MIN_BELT_MOVING_KMH)).toBeNull();
    expect(paceSecPerKmFromKmh(null)).toBeNull();
  });
});
