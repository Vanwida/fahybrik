// La mitad PURA del fallback del plan directo (shared/domain/coach/
// macro-progress.ts): cuántas semanas SEGUIDAS con trabajo hay hasta el ancla.
// El borde que importa —el agujero corta la cuenta— se fija aquí sin base de
// datos; la consulta y el cableado se prueban en
// tests/coach-integration/macro-progress.test.ts.
import { expect, test } from 'vitest';
import { semanasSeguidasConTrabajo } from '@fahybrid/shared/domain/coach/macro-progress';

const ANCLA = '2026-03-09';

test('el ancla sin trabajo no tiene posición', () => {
  expect(semanasSeguidasConTrabajo([], ANCLA)).toBeNull();
  expect(semanasSeguidasConTrabajo(['2026-03-02'], ANCLA)).toBeNull();
});

test('solo el ancla: semana 1', () => {
  expect(semanasSeguidasConTrabajo([ANCLA], ANCLA)).toBe(1);
});

test('la racha se cuenta entera, con las semanas en cualquier orden', () => {
  expect(semanasSeguidasConTrabajo(['2026-02-23', ANCLA, '2026-03-02'], ANCLA)).toBe(3);
});

test('el agujero corta: lo de antes del hueco es otro plan', () => {
  // 2026-02-23 queda separada del ancla por la semana vacía del 2 de marzo.
  expect(semanasSeguidasConTrabajo(['2026-02-23', ANCLA], ANCLA)).toBe(1);
});

test('las semanas por delante del ancla no cuentan hacia atrás', () => {
  expect(semanasSeguidasConTrabajo([ANCLA, '2026-03-16', '2026-03-23'], ANCLA)).toBe(1);
});
