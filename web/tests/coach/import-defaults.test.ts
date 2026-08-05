/**
 * coach_import_defaults resolver — the photo importer's fallback for the
 * three things a coach's screenshot routinely omits (rest between sets, RIR,
 * rep count). Fixes the contract: the system defaults serve until the coach
 * saves a row of their own, and `is_custom` always reflects which happened.
 */
import { describe, expect, test } from 'vitest';
import { createFakeSql } from '../utils/fake-sql';
import { DEFAULT_IMPORT_DEFAULTS } from '@fahybrid/shared/domain/coach-import-defaults';
import {
  getImportDefaults,
  resolveImportDefaults,
  upsertImportDefaults,
} from '@/lib/coach/import-defaults';

const COACH_ROW = {
  rest_strength_s: 120,
  rest_conditioning_s: 45,
  rest_core_mobility_s: 20,
  rir_strength: 1.5,
  rep_range_min: 6,
  rep_range_max: 10,
  updated_at: '2026-08-05T10:00:00.000Z',
};

/** No row for this coach — every query returns empty. */
function sqlNoRow() {
  return createFakeSql(() => []);
}

/** Exactly one coach-authored row, whatever the query. */
function sqlWithRow() {
  return createFakeSql(() => [COACH_ROW]);
}

describe('resolveImportDefaults — el relleno que usa el importador', () => {
  test('sin fila del coach: sirve los defaults del sistema', async () => {
    const values = await resolveImportDefaults(BigInt(1), sqlNoRow());
    expect(values).toEqual(DEFAULT_IMPORT_DEFAULTS);
  });

  test('con fila del coach: gana su fila, no el sistema', async () => {
    const values = await resolveImportDefaults(BigInt(1), sqlWithRow());
    expect(values).toEqual({
      rest_strength_s: 120,
      rest_conditioning_s: 45,
      rest_core_mobility_s: 20,
      rir_strength: 1.5,
      rep_range_min: 6,
      rep_range_max: 10,
    });
  });
});

describe('getImportDefaults — el editor del coach', () => {
  test('sin fila: is_custom false, updated_at null, valores del sistema', async () => {
    const res = await getImportDefaults(BigInt(1), sqlNoRow());
    expect(res.is_custom).toBe(false);
    expect(res.updated_at).toBeNull();
    expect(res).toMatchObject(DEFAULT_IMPORT_DEFAULTS);
  });

  test('con fila: is_custom true, updated_at de la fila, valores del coach', async () => {
    const res = await getImportDefaults(BigInt(1), sqlWithRow());
    expect(res.is_custom).toBe(true);
    expect(res.updated_at).toBe(COACH_ROW.updated_at);
    expect(res.rir_strength).toBe(1.5);
    expect(res.rep_range_min).toBe(6);
    expect(res.rep_range_max).toBe(10);
  });
});

describe('upsertImportDefaults — guardar reemplaza el set completo', () => {
  test('escribe las seis columnas y devuelve is_custom true', async () => {
    let insertSeen = false;
    const fake = createFakeSql((text) => {
      if (text.includes('insert into coach_import_defaults')) {
        insertSeen = true;
        expect(text).toContain('on conflict (coach_id) do update');
        return [{ updated_at: '2026-08-05T11:00:00.000Z' }];
      }
      return [];
    });

    const res = await upsertImportDefaults(
      BigInt(7),
      {
        rest_strength_s: 100,
        rest_conditioning_s: 50,
        rest_core_mobility_s: 25,
        rir_strength: 3,
        rep_range_min: 10,
        rep_range_max: 15,
      },
      fake,
    );

    expect(insertSeen).toBe(true);
    expect(res.is_custom).toBe(true);
    expect(res.updated_at).toBe('2026-08-05T11:00:00.000Z');
    expect(res.rest_strength_s).toBe(100);
    expect(res.rep_range_max).toBe(15);
  });
});
