// Unit tests for the nutrition log data layer + OFF mapping + vision gating.
//
// We stub `sql` with a tag that records every query and returns scripted rows
// (repo test pattern). The OFF lookup gets an injected fetch. The vision route
// gating is tested via isVisionConfigured() (env-driven, 501 when unset).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Sql } from '@/lib/db';
import {
  createNutritionEntry,
  deleteNutritionEntry,
  listNutritionForDay,
} from '@/lib/nutrition/entries';
import {
  mapOffProduct,
  lookupBarcode,
  mapOffSearch,
  searchFoods,
} from '@/lib/nutrition/openfoodfacts';
import { isVisionConfigured } from '@/lib/nutrition/vision';

type Call = { raw: string; values: unknown[] };

/**
 * Fake postgres.js tag. The real client also exposes `.json()`, `.unsafe()` and
 * is callable; we provide those so the data layer's helpers don't blow up.
 */
function makeFakeSql(scripted: Array<unknown[] | Error>): { sql: Sql; calls: Call[] } {
  const calls: Call[] = [];
  let cursor = 0;
  const tag = (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> => {
    const raw = strings.join('?');
    calls.push({ raw, values });
    const next = scripted[cursor++] ?? [];
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next);
  };
  tag.json = (v: unknown) => ({ __json: v });
  tag.unsafe = (s: string) => s;
  return { sql: tag as unknown as Sql, calls };
}

const DB_ROW = {
  id: '7',
  logged_for: '2026-05-29',
  name: 'Pollo y arroz',
  kcal: '520.5',
  protein_g: '45',
  carbs_g: '60',
  fat_g: '10',
  quantity: '1',
  unit: 'ración',
  source: 'manual',
  barcode: null,
  created_at: '2026-05-29T12:00:00Z',
};

describe('createNutritionEntry', () => {
  it('inserts for the athlete and returns the mapped entry (numbers, not strings)', async () => {
    const { sql, calls } = makeFakeSql([[DB_ROW]]);
    const entry = await createNutritionEntry({
      athlete_id: BigInt(42),
      input: {
        logged_for: '2026-05-29',
        name: 'Pollo y arroz',
        kcal: 520.5,
        protein_g: 45,
        carbs_g: 60,
        fat_g: 10,
        quantity: 1,
        unit: 'ración',
        source: 'manual',
      },
      client: sql,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.raw).toMatch(/insert into nutrition_entries/i);
    expect(calls[0]!.values).toContain(BigInt(42)); // athlete_id bound
    expect(calls[0]!.values).toContain('2026-05-29');
    // numerics normalised to JS numbers
    expect(entry.kcal).toBe(520.5);
    expect(entry.protein_g).toBe(45);
    expect(entry.id).toBe('7');
    expect(entry.source).toBe('manual');
  });
});

describe('listNutritionForDay', () => {
  it('returns entries + summed totals for the athlete on a day', async () => {
    const second = { ...DB_ROW, id: '8', kcal: '200', protein_g: '5', carbs_g: '30', fat_g: '8' };
    const { sql, calls } = makeFakeSql([[DB_ROW, second]]);
    const { entries, totals } = await listNutritionForDay({
      athlete_id: BigInt(42),
      date: '2026-05-29',
      client: sql,
    });
    expect(calls[0]!.raw).toMatch(/from nutrition_entries/i);
    expect(calls[0]!.raw).toMatch(/athlete_id =/);
    expect(calls[0]!.values).toContain(BigInt(42));
    expect(entries).toHaveLength(2);
    expect(totals).toEqual({ kcal: 720.5, protein_g: 50, carbs_g: 90, fat_g: 18 });
  });

  it('returns empty entries + zeroed totals when no rows (honest empty)', async () => {
    const { sql } = makeFakeSql([[]]);
    const { entries, totals } = await listNutritionForDay({
      athlete_id: BigInt(1),
      date: '2026-05-29',
      client: sql,
    });
    expect(entries).toEqual([]);
    expect(totals).toEqual({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  });
});

describe('deleteNutritionEntry (ownership)', () => {
  it('returns true when a row owned by the athlete is deleted', async () => {
    const { sql, calls } = makeFakeSql([[{ id: '7' }]]);
    const ok = await deleteNutritionEntry({ athlete_id: BigInt(42), id: BigInt(7), client: sql });
    expect(ok).toBe(true);
    expect(calls[0]!.raw).toMatch(/delete from nutrition_entries/i);
    expect(calls[0]!.raw).toMatch(/athlete_id =/); // ownership in WHERE
    expect(calls[0]!.values).toContain(BigInt(42));
    expect(calls[0]!.values).toContain(BigInt(7));
  });

  it('returns false when the id is not the athlete\'s (→ route maps to 404, not 403)', async () => {
    const { sql } = makeFakeSql([[]]); // foreign id deletes nothing
    const ok = await deleteNutritionEntry({ athlete_id: BigInt(42), id: BigInt(999), client: sql });
    expect(ok).toBe(false);
  });
});

describe('mapOffProduct (Open Food Facts)', () => {
  it('maps nutriments to flat per-100g macros', () => {
    const off = {
      status: 1,
      product: {
        product_name: 'Greek Yogurt',
        nutriments: {
          'energy-kcal_100g': 59,
          proteins_100g: 10,
          carbohydrates_100g: 3.6,
          fat_100g: 0.4,
        },
      },
    };
    const r = mapOffProduct('5410041000000', off);
    expect(r).toMatchObject({
      found: true,
      name: 'Greek Yogurt',
      kcal: 59,
      protein_g: 10,
      carbs_g: 3.6,
      fat_g: 0.4,
      per: '100g',
      barcode: '5410041000000',
    });
  });

  it('returns { found:false } when OFF status is 0', () => {
    expect(mapOffProduct('000', { status: 0 })).toEqual({ found: false });
  });

  it('returns { found:false } for an empty shell (no name, no macros)', () => {
    expect(mapOffProduct('111', { status: 1, product: { nutriments: {} } })).toEqual({
      found: false,
    });
  });
});

describe('lookupBarcode (graceful failure)', () => {
  it('maps a successful OFF fetch', async () => {
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({
          status: 1,
          product: { product_name: 'Banana', nutriments: { 'energy-kcal_100g': 89 } },
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const r = await lookupBarcode('1234567', fakeFetch);
    expect(r.found).toBe(true);
    expect(r.name).toBe('Banana');
    expect(r.kcal).toBe(89);
  });

  it('returns { found:false } (not a throw) when OFF is unreachable', async () => {
    const fakeFetch = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const r = await lookupBarcode('1234567', fakeFetch);
    expect(r).toEqual({ found: false });
  });

  it('returns { found:false } on a non-200 OFF response', async () => {
    const fakeFetch = (async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    const r = await lookupBarcode('1234567', fakeFetch);
    expect(r).toEqual({ found: false });
  });
});

describe('mapOffSearch (Open Food Facts search)', () => {
  it('maps products to flat per-100g results (name + first brand + barcode)', () => {
    const body = {
      products: [
        {
          product_name: 'Yogur Griego',
          brands: 'Fage, Total',
          code: '5410041000000',
          nutriments: {
            'energy-kcal_100g': 97,
            proteins_100g: 9,
            carbohydrates_100g: 4,
            fat_100g: 5,
          },
        },
      ],
    };
    const { results } = mapOffSearch(body);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      name: 'Yogur Griego',
      brand: 'Fage',
      kcal: 97,
      protein_g: 9,
      carbs_g: 4,
      fat_g: 5,
      per: '100g',
      barcode: '5410041000000',
    });
  });

  it('drops products with no name or no kcal, defaults missing macros to 0', () => {
    const body = {
      products: [
        { product_name: '', nutriments: { 'energy-kcal_100g': 50 } }, // no name
        { product_name: 'Sin energía', nutriments: { proteins_100g: 3 } }, // no kcal
        { product_name: 'Pollo', nutriments: { 'energy-kcal_100g': 165 } }, // ok, macros→0
        { nutriments: { 'energy-kcal_100g': 10 } }, // no name key
      ],
    };
    const { results } = mapOffSearch(body);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      name: 'Pollo',
      kcal: 165,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
    });
    expect(results[0]!.barcode).toBeUndefined();
  });

  it('returns [] for an empty / malformed payload', () => {
    expect(mapOffSearch({}).results).toEqual([]);
    expect(mapOffSearch({ products: undefined }).results).toEqual([]);
  });
});

describe('searchFoods (graceful failure)', () => {
  it('maps a successful OFF search fetch', async () => {
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({
          products: [
            { product_name: 'Banana', nutriments: { 'energy-kcal_100g': 89, proteins_100g: 1.1 } },
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const { results } = await searchFoods('banana', fakeFetch);
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('Banana');
    expect(results[0]!.kcal).toBe(89);
    expect(results[0]!.protein_g).toBe(1.1);
  });

  it('returns { results: [] } (not a throw) when OFF is unreachable', async () => {
    const fakeFetch = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    expect(await searchFoods('pollo', fakeFetch)).toEqual({ results: [] });
  });

  it('returns { results: [] } on a non-200 OFF response', async () => {
    const fakeFetch = (async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    expect(await searchFoods('pollo', fakeFetch)).toEqual({ results: [] });
  });
});

describe('vision gating (LLM_VISION_MODEL env)', () => {
  const original = process.env.LLM_VISION_MODEL;
  beforeEach(() => {
    delete process.env.LLM_VISION_MODEL;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.LLM_VISION_MODEL;
    else process.env.LLM_VISION_MODEL = original;
  });

  it('isVisionConfigured() is false without env (route → 501)', () => {
    expect(isVisionConfigured()).toBe(false);
  });

  it('isVisionConfigured() is true once a model is configured', () => {
    process.env.LLM_VISION_MODEL = 'openai/gpt-4o';
    expect(isVisionConfigured()).toBe(true);
  });

  it('blank/whitespace model is treated as unconfigured (never a default)', () => {
    process.env.LLM_VISION_MODEL = '   ';
    expect(isVisionConfigured()).toBe(false);
  });
});
