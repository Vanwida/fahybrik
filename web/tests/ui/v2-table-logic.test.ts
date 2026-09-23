import { describe, expect, test } from 'vitest';
import {
  applySelection,
  nextSort,
  rangeIds,
  sortRows,
  windowRange,
} from '@/components/v2/ui/table-logic';

const ids = ['a', 'b', 'c', 'd', 'e'];

describe('sortRows', () => {
  const rows = [
    { n: 'Óscar', v: 3 },
    { n: 'ana', v: null },
    { n: 'Bea', v: 10 },
    { n: 'carla', v: 3 },
  ];
  test('números ascendentes y descendentes; empate conserva el orden', () => {
    expect(sortRows(rows, (r) => r.v, 'asc').map((r) => r.n)).toEqual(['Óscar', 'carla', 'Bea', 'ana']);
    expect(sortRows(rows, (r) => r.v, 'desc').map((r) => r.n)).toEqual(['Bea', 'Óscar', 'carla', 'ana']);
  });
  test('sin dato va al final en las dos direcciones', () => {
    expect(sortRows(rows, (r) => r.v, 'desc').at(-1)?.n).toBe('ana');
    expect(sortRows(rows, (r) => r.v, 'asc').at(-1)?.n).toBe('ana');
  });
  test('texto en español sin mayúsculas ni acentos', () => {
    expect(sortRows(rows, (r) => r.n, 'asc').map((r) => r.n)).toEqual(['ana', 'Bea', 'carla', 'Óscar']);
  });
  test('sin función de orden devuelve una copia intacta', () => {
    const out = sortRows(rows, undefined, 'asc');
    expect(out).toEqual(rows);
    expect(out).not.toBe(rows);
  });
});

describe('nextSort', () => {
  test('columna nueva → su dirección por defecto; la misma → invierte', () => {
    expect(nextSort(null, 'x')).toEqual({ id: 'x', dir: 'asc' });
    expect(nextSort({ id: 'y', dir: 'asc' }, 'x', 'desc')).toEqual({ id: 'x', dir: 'desc' });
    expect(nextSort({ id: 'x', dir: 'asc' }, 'x')).toEqual({ id: 'x', dir: 'desc' });
    expect(nextSort({ id: 'x', dir: 'desc' }, 'x')).toEqual({ id: 'x', dir: 'asc' });
  });
});

describe('selección', () => {
  test('rango en cualquier sentido', () => {
    expect(rangeIds(ids, 'b', 'd')).toEqual(['b', 'c', 'd']);
    expect(rangeIds(ids, 'd', 'b')).toEqual(['b', 'c', 'd']);
    expect(rangeIds(ids, 'zz', 'c')).toEqual(['c']);
  });
  test('clic simple alterna', () => {
    expect(applySelection([], ids, 'c', { shift: false, anchor: null })).toEqual(['c']);
    expect(applySelection(['c'], ids, 'c', { shift: false, anchor: 'c' })).toEqual([]);
  });
  test('shift-clic marca el rango desde el ancla', () => {
    expect(applySelection(['b'], ids, 'e', { shift: true, anchor: 'b' })).toEqual(['b', 'c', 'd', 'e']);
  });
  test('shift-clic sobre uno marcado desmarca el rango', () => {
    expect(applySelection(['a', 'b', 'c', 'd'], ids, 'c', { shift: true, anchor: 'a' })).toEqual(['d']);
  });
  test('la selección sale en el orden visible', () => {
    expect(applySelection(['e'], ids, 'a', { shift: false, anchor: null })).toEqual(['a', 'e']);
  });
});

describe('windowRange', () => {
  test('pinta lo visible más el margen, sin salirse', () => {
    expect(windowRange(0, 400, 40, 300, 5)).toEqual({ start: 0, end: 15 });
    expect(windowRange(4000, 400, 40, 300, 5)).toEqual({ start: 95, end: 115 });
    expect(windowRange(11900, 400, 40, 300, 5)).toEqual({ start: 292, end: 300 });
  });
});
