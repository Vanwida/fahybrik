import { describe, expect, test } from 'vitest';
import {
  COPY_NO_LO_SE,
  honestMeasureCopy,
  honestSchemeCopy,
  schemeInventaSetTable,
} from '@fahybrid/shared/domain/prescription';
import { dosisConSeries } from '@/components/design-twin/datos-reales';

// Card 128 · hueco 7. El doble del motor no puede callarse ni pintar hierro.

describe('motor en vivo · medida desconocida', () => {
  const fixture = { kind: 'future_dose' };

  test('dice no lo sé y no inventa una tabla de series', () => {
    expect(honestMeasureCopy(fixture)).toBe('no lo sé');
    expect(honestMeasureCopy(fixture)).toBe(COPY_NO_LO_SE);
    expect(schemeInventaSetTable(undefined)).toBe(false);
    expect(dosisConSeries({ dosis: null, medida: fixture })).toBe('no lo sé');
  });

  test('una medida ausente sigue siendo silencio, no un no lo sé', () => {
    expect(honestMeasureCopy(null)).toBeNull();
    expect(honestMeasureCopy(undefined)).toBeNull();
    expect(dosisConSeries({ dosis: null })).toBeNull();
  });
});

describe('motor en vivo · scheme desconocido', () => {
  const fixture = 'future_wod';

  test('dice no lo sé y no inventa una tabla de series', () => {
    expect(honestSchemeCopy(fixture)).toBe('no lo sé');
    expect(schemeInventaSetTable(fixture)).toBe(false);
    expect(schemeInventaSetTable('sets')).toBe(true);
    expect(schemeInventaSetTable('superset')).toBe(true);
    expect(schemeInventaSetTable('straight_sets')).toBe(true);
    expect(honestSchemeCopy('straight_sets')).toBeNull();
  });
});
