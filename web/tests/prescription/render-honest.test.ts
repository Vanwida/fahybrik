import { describe, expect, test } from 'vitest';
import {
  COPY_CIRCUITO,
  COPY_NO_LO_SE,
  COPY_SEGUIDO,
  honestMeasureCopy,
  honestSchemeCopy,
  schemeInventaSetTable,
  showsStationOrder,
  stationOrderLabel,
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

describe('estaciones · seguido o circuito', () => {
  test('un bloque circuito se lee circuito, también con una sola estación', () => {
    expect(stationOrderLabel('circuit')).toBe('circuito');
    expect(stationOrderLabel('circuit')).toBe(COPY_CIRCUITO);
    expect(stationOrderLabel('rounds')).toBe('circuito');
    expect(showsStationOrder('circuit')).toBe(true);
  });

  test('un bloque de estaciones secuencial se lee seguido', () => {
    expect(stationOrderLabel('for_time')).toBe('seguido');
    expect(stationOrderLabel('chipper')).toBe(COPY_SEGUIDO);
    expect(stationOrderLabel('hyrox_sim')).toBe('seguido');
    expect(showsStationOrder('for_time')).toBe(true);
  });

  test('un format que no está en el catálogo dice no lo sé y no inventa una tabla', () => {
    expect(stationOrderLabel('future_wod')).toBe('no lo sé');
    expect(stationOrderLabel('future_wod')).toBe(COPY_NO_LO_SE);
    expect(stationOrderLabel(null)).toBe('no lo sé');
    expect(stationOrderLabel('')).toBe('no lo sé');
    expect(schemeInventaSetTable('future_wod')).toBe(false);
    expect(showsStationOrder('future_wod')).toBe(true);
    expect(showsStationOrder(null)).toBe(false);
    expect(showsStationOrder('sets')).toBe(false);
  });
});
