/**
 * SEMANA CERO — `planZeroWeek` (shared/domain/coach/zero-week.ts).
 *
 * La ventana previa al arranque del plan mide de 1 a 7 días según el día en que
 * el coach asigne, así que la prueba de fuego es que TODOS los tamaños se
 * comporten y que nada se coloque en silencio donde no toca.
 *
 * Fechas reales del caso que lo motivó: el plan del atleta 64 arranca el lunes
 * 2026-08-10 y se le asignó el viernes 2026-08-07.
 */
import { describe, expect, test } from 'vitest';
import { planZeroWeek, type ZeroWeekItem } from '@fahybrid/shared/domain/coach/zero-week';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const LUNES_PLAN = d('2026-08-10');

/** Los 4 tests reales de Pablo, con sus días configurados en producción. */
const TESTS_REALES: ZeroWeekItem[] = [
  { id: '1rm', preferredDayOfWeek: 2, restDaysAfter: 1 }, // martes
  { id: '5k', preferredDayOfWeek: 3, restDaysAfter: 1 }, // miércoles
  { id: 'remo2k', preferredDayOfWeek: 5, restDaysAfter: 1 }, // viernes
  { id: 'halfsim', preferredDayOfWeek: 6, restDaysAfter: 1 }, // sábado
];

describe('la ventana según el día en que se asigna', () => {
  test('asignar LUNES da la ventana más grande (7 días menos el margen)', () => {
    const r = planZeroWeek({
      assignedOn: d('2026-08-03'),
      planStart: LUNES_PLAN,
      bufferDays: 1,
      items: [],
    });
    // Lun 3 … Sáb 8 (el domingo 9 es el margen).
    expect(r.window).toEqual([
      '2026-08-03', '2026-08-04', '2026-08-05',
      '2026-08-06', '2026-08-07', '2026-08-08',
    ]);
  });

  test('asignar VIERNES (el caso real) deja dos días útiles', () => {
    const r = planZeroWeek({
      assignedOn: d('2026-08-07'),
      planStart: LUNES_PLAN,
      bufferDays: 1,
      items: [],
    });
    expect(r.window).toEqual(['2026-08-07', '2026-08-08']);
  });

  test('asignar DOMINGO con margen 1 no deja ventana — y se dice', () => {
    const r = planZeroWeek({
      assignedOn: d('2026-08-09'),
      planStart: LUNES_PLAN,
      bufferDays: 1,
      items: TESTS_REALES,
    });
    expect(r.window).toEqual([]);
    expect(r.placed).toEqual([]);
    expect(r.skipped.map((s) => s.reason)).toEqual(['no_window', 'no_window', 'no_window', 'no_window']);
  });

  test('el margen del coach es dato: con 0 el domingo sí se usa', () => {
    const r = planZeroWeek({
      assignedOn: d('2026-08-09'),
      planStart: LUNES_PLAN,
      bufferDays: 0,
      items: [],
    });
    expect(r.window).toEqual(['2026-08-09']);
  });
});

describe('colocación', () => {
  test('respeta el día que el coach pidió cuando cabe', () => {
    const r = planZeroWeek({
      assignedOn: d('2026-08-03'), // lunes
      planStart: LUNES_PLAN,
      bufferDays: 1,
      items: [{ id: '1rm', preferredDayOfWeek: 2, restDaysAfter: 0 }],
    });
    expect(r.placed).toEqual([{ id: '1rm', iso: '2026-08-04', moved: false }]); // martes
  });

  test('desliza al primer hueco cuando el día pedido ya pasó, y lo marca movido', () => {
    // Se asigna el viernes; el 1RM estaba puesto el martes: ese día no existe ya.
    const r = planZeroWeek({
      assignedOn: d('2026-08-07'),
      planStart: LUNES_PLAN,
      bufferDays: 1,
      items: [{ id: '1rm', preferredDayOfWeek: 2, restDaysAfter: 0 }],
    });
    expect(r.placed).toEqual([{ id: '1rm', iso: '2026-08-07', moved: true }]);
  });

  test('el descanso que pide una pieza bloquea el día siguiente', () => {
    const r = planZeroWeek({
      assignedOn: d('2026-08-03'),
      planStart: LUNES_PLAN,
      bufferDays: 1,
      items: [
        { id: 'a', preferredDayOfWeek: 1, restDaysAfter: 1 }, // lunes, pide 1 libre
        { id: 'b', preferredDayOfWeek: 2, restDaysAfter: 0 }, // martes → ocupado por el descanso
      ],
    });
    expect(r.placed).toEqual([
      { id: 'a', iso: '2026-08-03', moved: false },
      { id: 'b', iso: '2026-08-05', moved: true }, // se va al miércoles
    ]);
  });

  test('nunca pisa un día que el atleta ya tenía ocupado', () => {
    const r = planZeroWeek({
      assignedOn: d('2026-08-03'),
      planStart: LUNES_PLAN,
      bufferDays: 1,
      occupied: ['2026-08-03', '2026-08-04'],
      items: [{ id: 'a', preferredDayOfWeek: 1, restDaysAfter: 0 }],
    });
    expect(r.placed).toEqual([{ id: 'a', iso: '2026-08-05', moved: true }]);
  });

  test('lo que no cabe se informa, no se apila', () => {
    // Ventana de 2 días (viernes) y los 4 tests reales, cada uno pidiendo
    // descanso detrás: solo entra el primero.
    const r = planZeroWeek({
      assignedOn: d('2026-08-07'),
      planStart: LUNES_PLAN,
      bufferDays: 1,
      items: TESTS_REALES,
    });
    expect(r.placed).toHaveLength(1);
    expect(r.placed[0]!.iso).toBe('2026-08-07');
    expect(r.skipped.map((s) => s.id)).toEqual(['5k', 'remo2k', 'halfsim']);
    expect(r.skipped.every((s) => s.reason === 'no_room')).toBe(true);
  });

  test('el orden de la lista ES la prioridad del coach', () => {
    // Un solo hueco: entra el primero de la lista, no el de día más temprano.
    const r = planZeroWeek({
      assignedOn: d('2026-08-08'), // sábado → ventana [sáb]
      planStart: LUNES_PLAN,
      bufferDays: 1,
      items: [
        { id: 'el-que-importa', preferredDayOfWeek: 6, restDaysAfter: 0 },
        { id: 'el-otro', preferredDayOfWeek: 1, restDaysAfter: 0 },
      ],
    });
    expect(r.placed.map((p) => p.id)).toEqual(['el-que-importa']);
    expect(r.skipped.map((s) => s.id)).toEqual(['el-otro']);
  });

  test('los 4 tests reales caben enteros cuando se asigna un lunes', () => {
    const r = planZeroWeek({
      assignedOn: d('2026-08-03'),
      planStart: LUNES_PLAN,
      bufferDays: 1,
      items: TESTS_REALES,
    });
    // Mar 1RM (su día) · mié bloqueado por su descanso → 5K se desliza al jue ·
    // vie bloqueado → remo al sáb. El half-sim ya no tiene hueco: 3 de 4, y se
    // dice cuál falta en vez de apilarlo.
    expect(r.placed).toEqual([
      { id: '1rm', iso: '2026-08-04', moved: false },
      { id: '5k', iso: '2026-08-06', moved: true },
      { id: 'remo2k', iso: '2026-08-08', moved: true },
    ]);
    expect(r.skipped.map((s) => s.id)).toEqual(['halfsim']);
  });
});
