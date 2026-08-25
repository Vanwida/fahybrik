import { describe, expect, it } from 'vitest';
import {
  TANDA_TODAS_HASTA,
  TANDA_VENTANA,
  tandaEsVentana,
  tandaIndices,
  tandaSeLee,
  tandaStrip,
} from '@fahybrid/shared/domain/tanda-strip';

describe('tandaSeLee — se leen las hechas y la actual', () => {
  it('en la 2 de 4 se leen 1 / 2 / 3 / 4 y la 1 ya está hecha', () => {
    const strip = tandaStrip({ total: 4, actual: 1, hechas: [0] });
    expect(tandaSeLee(strip)).toBe('1 / 2 / 3 / 4');
    expect(strip.pasos.map((p) => p.estado)).toEqual(['hecha', 'actual', 'futura', 'futura']);
    expect(tandaEsVentana(strip)).toBe(false);
  });

  it('en la primera de tres se leen las tres, no solo la que toca', () => {
    const strip = tandaStrip({ total: 3, actual: 0, hechas: [] });
    expect(tandaSeLee(strip)).toBe('1 / 2 / 3');
    expect(strip.pasos[0]?.estado).toBe('actual');
  });

  it('desde la quinta la tanda es ventana de tres pegada al cursor', () => {
    expect(TANDA_TODAS_HASTA).toBe(4);
    expect(TANDA_VENTANA).toBe(3);
    const strip = tandaStrip({
      total: 12,
      actual: 6,
      hechas: [0, 1, 2, 3, 4, 5],
    });
    expect(tandaSeLee(strip)).toBe('6 / 7 / 8');
    expect(strip.pasos.map((p) => p.estado)).toEqual(['hecha', 'actual', 'futura']);
    expect(tandaEsVentana(strip)).toBe(true);
  });

  it('en los extremos la ventana se desplaza, no se encoge', () => {
    expect(tandaIndices(12, 0)).toEqual([0, 1, 2]);
    expect(tandaSeLee(tandaStrip({ total: 12, actual: 0, hechas: [] }))).toBe('1 / 2 / 3');
    expect(tandaIndices(12, 11)).toEqual([9, 10, 11]);
    expect(
      tandaSeLee(tandaStrip({ total: 12, actual: 11, hechas: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] })),
    ).toBe('10 / 11 / 12');
  });

  it('una serie saltada se dice saltada, no hecha', () => {
    const strip = tandaStrip({ total: 4, actual: 1, hechas: [], saltadas: [0] });
    expect(strip.pasos[0]?.estado).toBe('saltada');
    expect(strip.pasos[1]?.estado).toBe('actual');
    expect(tandaSeLee(strip)).toBe('1 / 2 / 3 / 4');
  });

  it('sin series no se inventa una tanda', () => {
    const strip = tandaStrip({ total: 0, actual: 0, hechas: [] });
    expect(tandaSeLee(strip)).toBe('');
    expect(strip.pasos).toEqual([]);
  });
});
