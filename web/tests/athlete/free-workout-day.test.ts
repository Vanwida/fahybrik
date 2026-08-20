/**
 * EL DÍA DE UN ENTRENO ES EL DÍA EN QUE SE ENTRENÓ (card 121).
 *
 * El 20-ago, al arreglarse el guardado, el iPhone vació de golpe su cola de
 * envíos: cinco entrenos libres del 19 entraron a la vez y quedaron archivados en
 * el 20, porque el día del entreno salía de `new Date()` — el instante de la
 * petición, no el del trabajo. En el plan del atleta aparecía el entreno de ayer
 * contado hoy: el 19 vacío y el 20 con cinco sesiones que no ocurrieron.
 *
 * Puro: sin base de datos. La zona del box (Europe/Madrid) es la misma que usa el
 * resto del producto para decir «hoy».
 */
import { expect, test } from 'vitest';
import { freeWorkoutDay } from '@/lib/athlete/create-free-workout';

test('un entreno subido al día siguiente se archiva en el día en que se hizo', () => {
  // El caso real: entrenó el 19 a las 10:29 UTC (12:29 en Barcelona) y la cola no
  // se vació hasta el 20 por la tarde.
  const subida = new Date('2026-08-20T14:35:00Z');
  expect(freeWorkoutDay('2026-08-19T10:29:45Z', subida)).toBe('2026-08-19');
});

test('un entreno del día se sigue archivando en el día', () => {
  const ahora = new Date('2026-08-20T14:35:00Z');
  expect(freeWorkoutDay('2026-08-20T09:10:00Z', ahora)).toBe('2026-08-20');
});

test('el día es el del box, no el de UTC: un entreno de madrugada cae donde se vivió', () => {
  // 23:30 UTC del 19 son las 01:30 del 20 en Barcelona. El atleta lo vivió el 20.
  const ahora = new Date('2026-08-20T08:00:00Z');
  expect(freeWorkoutDay('2026-08-19T23:30:00Z', ahora)).toBe('2026-08-20');
});

test('sin hora de inicio se cae a hoy, como siempre', () => {
  const ahora = new Date('2026-08-20T14:35:00Z');
  expect(freeWorkoutDay(undefined, ahora)).toBe('2026-08-20');
});

test('una hora ilegible no archiva en ningún sitio raro: hoy', () => {
  const ahora = new Date('2026-08-20T14:35:00Z');
  expect(freeWorkoutDay('ayer por la tarde', ahora)).toBe('2026-08-20');
});

test('un reloj adelantado no puede archivar trabajo en el futuro', () => {
  const ahora = new Date('2026-08-20T14:35:00Z');
  // Dos días por delante: no es deriva de reloj, es una hora que no nos creemos.
  expect(freeWorkoutDay('2026-08-22T10:00:00Z', ahora)).toBe('2026-08-20');
  // Pero una deriva de un par de minutos SÍ se tolera: sigue siendo hoy.
  expect(freeWorkoutDay('2026-08-20T14:37:00Z', ahora)).toBe('2026-08-20');
});
