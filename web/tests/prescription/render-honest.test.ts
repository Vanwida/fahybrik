import { describe, expect, test } from 'vitest';
import {
  honestMeasureCopy,
  honestSchemeCopy,
  schemeInventaSetTable,
} from '@fahybrid/shared/domain/prescription';
import { dosisConSeries } from '@/components/design-twin/datos-reales';

describe('motor en vivo · medida desconocida', () => {
  const fixture = { kind: 'future_dose' };

  test('un kind que no está en el catálogo se queda vacío y no inventa una tabla', () => {
    expect(honestMeasureCopy(fixture)).toBeNull();
    expect(schemeInventaSetTable(undefined)).toBe(false);
    expect(dosisConSeries({ dosis: null, medida: fixture })).toBeNull();
  });

  test('al fallo se queda', () => {
    expect(honestMeasureCopy({ kind: 'reps_to_failure' })).toBe('al fallo');
  });

  test('una medida ausente es silencio', () => {
    expect(honestMeasureCopy(null)).toBeNull();
    expect(honestMeasureCopy(undefined)).toBeNull();
    expect(dosisConSeries({ dosis: null })).toBeNull();
  });
});

describe('motor en vivo · scheme desconocido', () => {
  const fixture = 'future_wod';

  test('un scheme que no está en el catálogo se queda vacío y no inventa una tabla', () => {
    expect(honestSchemeCopy(fixture)).toBeNull();
    expect(schemeInventaSetTable(fixture)).toBe(false);
    expect(schemeInventaSetTable('sets')).toBe(true);
    expect(schemeInventaSetTable('superset')).toBe(true);
    expect(schemeInventaSetTable('straight_sets')).toBe(true);
    expect(honestSchemeCopy('straight_sets')).toBeNull();
  });
});
