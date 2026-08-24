/**
 * Tabla de cargas de competición del coach — card 130, pieza 2.
 *
 * Lo que se prueba: el default es vacío («no lo sé»), una celda no contesta
 * por otra, el kind y los implementos salen del catálogo (no del coach), y
 * nadie inventa un kilo.
 */
import { describe, expect, test } from 'vitest';
import {
  COACH_STATION_LOAD_CELL_COUNT,
  coachStationLoadStations,
  emptyCoachStationLoadGrid,
  filledCoachStationLoadCount,
  lookupCoachStationLoad,
  mergeCoachStationLoadGrid,
  persistableCoachStationLoadCells,
  stationLoadFromCoachValue,
} from '@fahybrid/shared/domain/coach/station-loads';
import { HYROX_FARMER_IMPLEMENTS } from '@fahybrid/shared/domain/hyrox/stations';

describe('la rejilla nace vacía', () => {
  test('63 celdas (7 estaciones × 3 divisiones × 3 géneros) y el burpee no entra', () => {
    const grid = emptyCoachStationLoadGrid();
    expect(grid).toHaveLength(COACH_STATION_LOAD_CELL_COUNT);
    expect(COACH_STATION_LOAD_CELL_COUNT).toBe(63);
    expect(coachStationLoadStations().some((s) => s.slug === 'hyrox-burpee-broad-jump')).toBe(
      false,
    );
    expect(filledCoachStationLoadCount(grid)).toBe(0);
    expect(grid.every((c) => c.kg == null && c.damper == null)).toBe(true);
  });

  test('farmers declara 2 implementos, y el coach no puede cambiarlos', () => {
    const farmers = coachStationLoadStations().find((s) => s.slug === 'hyrox-farmer-carry');
    expect(farmers?.load_axis).toBe('per_implement');
    expect(farmers?.implements).toBe(HYROX_FARMER_IMPLEMENTS);
  });
});

describe('lookup: exacto o null, nunca otra celda', () => {
  const rows = [
    { station_slug: 'hyrox-sled-push', division: 'open', gender: 'men', kg: 152, damper: null },
  ];

  test('Open men sled → los kilos que escribió el coach', () => {
    expect(lookupCoachStationLoad(rows, 'hyrox-sled-push', 'open', 'men')).toEqual({
      kind: 'sled',
      kg: 152,
    });
  });

  test('la misma estación en Pro women no hereda el número de Open men', () => {
    expect(lookupCoachStationLoad(rows, 'hyrox-sled-push', 'pro', 'women')).toBeNull();
  });

  test('Open women no hereda el de hombres', () => {
    expect(lookupCoachStationLoad(rows, 'hyrox-sled-push', 'open', 'women')).toBeNull();
  });

  test('otra estación en la misma celda de división/género es otro hueco', () => {
    expect(lookupCoachStationLoad(rows, 'hyrox-sled-pull', 'open', 'men')).toBeNull();
  });

  test('tabla vacía → null', () => {
    expect(lookupCoachStationLoad([], 'hyrox-sled-push', 'open', 'men')).toBeNull();
  });
});

describe('el kind sale del catálogo, no de la fila', () => {
  test('farmers: kg del coach + 2 implementos del catálogo', () => {
    expect(
      stationLoadFromCoachValue('hyrox-farmer-carry', { kg: 24 }),
    ).toEqual({ kind: 'per_implement', kg: 24, implements: 2 });
  });

  test('ski: damper, nunca kilos', () => {
    expect(stationLoadFromCoachValue('ski-erg', { damper: 5 })).toEqual({
      kind: 'damper',
      setting: 5,
    });
    expect(stationLoadFromCoachValue('ski-erg', { kg: 10 })).toBeNull();
  });

  test('burpee: no hay eje, null aunque alguien mande kg', () => {
    expect(stationLoadFromCoachValue('hyrox-burpee-broad-jump', { kg: 20 })).toBeNull();
  });

  test('cero o negativo no es un peso', () => {
    expect(stationLoadFromCoachValue('hyrox-wall-balls', { kg: 0 })).toBeNull();
    expect(stationLoadFromCoachValue('hyrox-wall-balls', { kg: -3 })).toBeNull();
  });
});

describe('merge y persistencia: vacío no se guarda', () => {
  test('el coach rellena una celda y el resto sigue vacío', () => {
    const grid = mergeCoachStationLoadGrid([
      { station_slug: 'hyrox-sled-push', division: 'open', gender: 'men', kg: 152, damper: null },
    ]);
    expect(filledCoachStationLoadCount(grid)).toBe(1);
    const hit = grid.find(
      (c) => c.station_slug === 'hyrox-sled-push' && c.division === 'open' && c.gender === 'men',
    );
    expect(hit?.kg).toBe(152);
    expect(grid.filter((c) => c.station_slug === 'hyrox-sled-push' && c.gender === 'women').every((c) => c.kg == null)).toBe(
      true,
    );
  });

  test('persistable omite vacías y no inventa damper en un trineo', () => {
    const persisted = persistableCoachStationLoadCells([
      { station_slug: 'hyrox-sled-push', division: 'open', gender: 'men', kg: 152 },
      { station_slug: 'hyrox-sled-push', division: 'open', gender: 'women' },
      { station_slug: 'ski-erg', division: 'open', gender: 'men', damper: 5 },
    ]);
    expect(persisted).toEqual([
      { station_slug: 'hyrox-sled-push', division: 'open', gender: 'men', kg: 152, damper: null },
      { station_slug: 'ski-erg', division: 'open', gender: 'men', kg: null, damper: 5 },
    ]);
  });
});
