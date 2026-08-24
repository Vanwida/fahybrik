import { describe, expect, test } from 'vitest';
import { createFakeSql } from '../utils/fake-sql';
import {
  getCoachStationLoads,
  loadCoachStationLoadLookup,
  upsertCoachStationLoads,
} from '@/lib/coach/station-loads';
import { COACH_STATION_LOAD_CELL_COUNT } from '@fahybrid/shared/domain/coach/station-loads';

describe('getCoachStationLoads', () => {
  test('sin filas: rejilla vacía, filled_count 0, updated_at null', async () => {
    const sql = createFakeSql(() => []);
    const res = await getCoachStationLoads(BigInt(1), sql);
    expect(res.cells).toHaveLength(COACH_STATION_LOAD_CELL_COUNT);
    expect(res.filled_count).toBe(0);
    expect(res.updated_at).toBeNull();
    expect(res.cells.every((c) => c.kg == null && c.damper == null)).toBe(true);
  });

  test('con una fila: solo esa celda tiene número', async () => {
    const sql = createFakeSql(() => [
      {
        station_slug: 'hyrox-sled-push',
        division: 'open',
        gender: 'men',
        kg: 152,
        damper: null,
        updated_at: '2026-08-24T10:00:00.000Z',
      },
    ]);
    const res = await getCoachStationLoads(BigInt(1), sql);
    expect(res.filled_count).toBe(1);
    expect(res.updated_at).toBe('2026-08-24T10:00:00.000Z');
    const hit = res.cells.find(
      (c) => c.station_slug === 'hyrox-sled-push' && c.division === 'open' && c.gender === 'men',
    );
    expect(hit?.kg).toBe(152);
    expect(
      res.cells.find(
        (c) => c.station_slug === 'hyrox-sled-push' && c.division === 'open' && c.gender === 'women',
      )?.kg,
    ).toBeNull();
  });
});

describe('loadCoachStationLoadLookup', () => {
  test('inyecta la forma del catálogo (sled) con el kg del coach', async () => {
    const sql = createFakeSql(() => [
      {
        station_slug: 'hyrox-sled-push',
        division: 'open',
        gender: 'men',
        kg: 152,
        damper: null,
        updated_at: '2026-08-24T10:00:00.000Z',
      },
    ]);
    const lookup = await loadCoachStationLoadLookup(BigInt(1), sql);
    expect(lookup('hyrox-sled-push', 'open', 'men')).toEqual({ kind: 'sled', kg: 152 });
    expect(lookup('hyrox-sled-push', 'open', 'women')).toBeNull();
    expect(lookup('hyrox-farmer-carry', 'open', 'men')).toBeNull();
  });
});

describe('upsertCoachStationLoads', () => {
  test('reemplaza el conjunto: borra y escribe solo las celdas con dato', async () => {
    const seen: string[] = [];
    const sql = createFakeSql((text) => {
      seen.push(text);
      if (text.includes('delete from coach_station_loads')) return [];
      if (text.includes('insert into coach_station_loads')) return [];
      return [];
    });
    await upsertCoachStationLoads(
      BigInt(4),
      {
        cells: [
          { station_slug: 'hyrox-sled-push', division: 'open', gender: 'men', kg: 152 },
          { station_slug: 'hyrox-sled-push', division: 'open', gender: 'women' },
        ],
      },
      sql,
    );
    expect(seen.some((t) => t.includes('delete from coach_station_loads'))).toBe(true);
    const inserts = seen.filter((t) => t.includes('insert into coach_station_loads'));
    expect(inserts).toHaveLength(1);
  });
});
