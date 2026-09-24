// La RPE y la RIR de una serie guardan su medio punto: el editor de series de la
// app va de 0,5 en 0,5 y la columna es numeric(3,1). Redondear a entero convertía
// el 8,5 del atleta en 9.

import { describe, expect, it } from 'vitest';
import { sanitizeRpe } from '@/lib/sync/sanitize-measurement';

describe('RPE y RIR de una serie', () => {
  it('guardan el medio punto', () => {
    expect(sanitizeRpe(8.5)).toBe(8.5);
    expect(sanitizeRpe(1.5)).toBe(1.5);
  });

  it('quedan en un decimal, lo que cabe en la columna', () => {
    expect(sanitizeRpe(8.46)).toBe(8.5);
    expect(sanitizeRpe(7.04)).toBe(7);
  });

  it('los extremos valen', () => {
    expect(sanitizeRpe(0)).toBe(0);
    expect(sanitizeRpe(10)).toBe(10);
  });

  it('fuera de 0–10 o sin número: nada', () => {
    expect(sanitizeRpe(10.5)).toBeNull();
    expect(sanitizeRpe(-0.5)).toBeNull();
    expect(sanitizeRpe(Number.NaN)).toBeNull();
    expect(sanitizeRpe(null)).toBeNull();
    expect(sanitizeRpe(undefined)).toBeNull();
  });
});
