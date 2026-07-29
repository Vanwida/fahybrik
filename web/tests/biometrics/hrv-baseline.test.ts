// La VFC contra su línea base. Una regla, unas ventanas — estaban escritas en
// SQL en tres sitios y la barra de disposición ni siquiera las miraba: regalaba
// 12 puntos de 12 a todo el mundo, todos los días.

import { describe, expect, test } from 'vitest';
import {
  HRV_BASELINE_FROM_DAYS,
  HRV_BASELINE_TO_DAYS,
  HRV_RECENT_DAYS,
  hrvDeltaMs,
  meanOverWindow,
  type HrvSample,
} from '@fahybrid/shared/domain/biometrics/hrv-baseline';

const NOW = new Date('2026-07-29T08:00:00Z');
const DAY = 86_400_000;

/** A reading `daysAgo` before NOW. */
function at(daysAgo: number, value: number): HrvSample {
  return { at: new Date(NOW.getTime() - daysAgo * DAY), value };
}

describe('hrvDeltaMs', () => {
  test('sin lecturas recientes no hay delta: no es un cero', () => {
    const old = [at(50, 40), at(40, 40), at(30, 40)];
    expect(hrvDeltaMs(old, NOW)).toBeNull();
  });

  test('sin línea base tampoco: tres días de datos no son una referencia', () => {
    const fresh = [at(2, 55), at(1, 54), at(0, 56)];
    expect(hrvDeltaMs(fresh, NOW)).toBeNull();
  });

  test('con ambas ventanas, recent − baseline, en ms y con signo', () => {
    const samples = [
      // línea base: 60 → 14 días atrás
      at(50, 50),
      at(30, 50),
      at(20, 50),
      // reciente: últimos 7 días
      at(3, 40),
      at(1, 40),
    ];
    expect(hrvDeltaMs(samples, NOW)).toBe(-10);
  });

  test('la quincena aguda NO entra en su propia referencia', () => {
    // Una caída de los últimos 10 días no puede arrastrar la línea base contra
    // la que se compara: si entrase, el atleta suprimido leería «normal».
    const samples = [at(50, 50), at(30, 50), at(10, 20), at(2, 20)];
    // baseline = solo los de 50 y 30 días → 50. recent = el de 2 días → 20.
    expect(hrvDeltaMs(samples, NOW)).toBe(-30);
  });

  test('una lectura tomada justo ahora cuenta como reciente', () => {
    const samples = [at(50, 50), at(30, 50), at(0, 45)];
    expect(hrvDeltaMs(samples, NOW)).toBe(-5);
  });

  test('las ventanas son las declaradas y no se solapan', () => {
    expect(HRV_RECENT_DAYS).toBeLessThan(HRV_BASELINE_TO_DAYS);
    expect(HRV_BASELINE_TO_DAYS).toBeLessThan(HRV_BASELINE_FROM_DAYS);
  });
});

describe('meanOverWindow', () => {
  test('ventana vacía → null, nunca 0', () => {
    expect(meanOverWindow([], new Date(0), NOW)).toBeNull();
  });

  test('promedia las lecturas CRUDAS, no un promedio de promedios diarios', () => {
    // Dos lecturas un día y una al siguiente: la media es 30, no 32,5.
    const samples = [at(3, 10), at(3, 20), at(2, 60)];
    const mean = meanOverWindow(samples, new Date(NOW.getTime() - 7 * DAY), NOW);
    expect(mean).toBe(30);
  });
});
