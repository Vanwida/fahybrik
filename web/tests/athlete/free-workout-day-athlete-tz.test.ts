/**
 * EL DÍA DE UN ENTRENO LIBRE ES EL DEL ATLETA, NO EL DEL BOX.
 *
 * `freeWorkoutDay` ya fechaba el entreno por su hora de inicio (card 121), pero en
 * el calendario del box: un entreno hecho a las 20:00 en Los Ángeles se archivaba
 * en el día siguiente, porque en Madrid ya eran las 05:00. La regla
 * (docs/DECISIONS.md, 2026-09-23 «Qué día es en cada sitio»): lo que vive el
 * atleta va en su huso (`athletes.timezone`), que `createFreeWorkout` le pasa.
 *
 * Puro: sin base de datos. Los casos sin huso (el defecto del producto) viven en
 * free-workout-day.test.ts.
 */
import { expect, test } from 'vitest';
import { freeWorkoutDay } from '@/lib/athlete/create-free-workout';

const LA = 'America/Los_Angeles';

test('un entreno de las 20:00 en Los Ángeles es de ese día, no del siguiente de Madrid', () => {
  // 03:00 UTC del lunes 21 = 20:00 del domingo 20 en Los Ángeles (05:00 del 21 en Madrid).
  const subida = new Date('2026-09-21T10:00:00Z');
  expect(freeWorkoutDay('2026-09-21T03:00:00Z', subida, LA)).toBe('2026-09-20');
});

test('un entreno de madrugada en Auckland ya es del día siguiente al de Madrid', () => {
  // 13:30 UTC del domingo 20 = 01:30 del lunes 21 en Auckland (15:30 del 20 en Madrid).
  const subida = new Date('2026-09-20T20:00:00Z');
  expect(freeWorkoutDay('2026-09-20T13:30:00Z', subida, 'Pacific/Auckland')).toBe('2026-09-21');
});

test('sin hora de inicio, ilegible o del futuro, cae al HOY del atleta', () => {
  // 05:00 UTC del lunes 21 = domingo 20 a las 22:00 en Los Ángeles (lunes 07:00 en Madrid).
  const ahora = new Date('2026-09-21T05:00:00Z');
  expect(freeWorkoutDay(undefined, ahora, LA)).toBe('2026-09-20');
  expect(freeWorkoutDay('ayer por la tarde', ahora, LA)).toBe('2026-09-20');
  expect(freeWorkoutDay('2026-09-23T10:00:00Z', ahora, LA)).toBe('2026-09-20');
});
