import { describe, expect, test } from 'vitest';
import { createFakeSql } from '../utils/fake-sql';
import {
  getCoachPhraseDictionary,
  loadCoachPhraseDictionary,
  upsertCoachPhraseDictionary,
} from '@/lib/coach/phrase-dictionary';

describe('getCoachPhraseDictionary', () => {
  test('sin filas: lista vacía, updated_at null', async () => {
    const sql = createFakeSql(() => []);
    const res = await getCoachPhraseDictionary(BigInt(1), sql);
    expect(res.entries).toEqual([]);
    expect(res.updated_at).toBeNull();
  });

  test('con una fila: esa frase y ningún default inventado', async () => {
    const sql = createFakeSql(() => [
      {
        phrase_key: 'carga media',
        phrase: 'carga media',
        as_kind: 'competition_percent',
        value: 60,
        value_max: null,
        updated_at: '2026-08-24T22:00:00.000Z',
      },
    ]);
    const res = await getCoachPhraseDictionary(BigInt(1), sql);
    expect(res.entries).toEqual([
      { phrase: 'carga media', phrase_key: 'carga media', as: 'competition_percent', value: 60 },
    ]);
    expect(res.updated_at).toBe('2026-08-24T22:00:00.000Z');
  });
});

describe('loadCoachPhraseDictionary', () => {
  test('devuelve un mapa listo para el importador', async () => {
    const sql = createFakeSql(() => [
      {
        phrase_key: 'carga media',
        phrase: 'carga media',
        as_kind: 'competition_percent',
        value: 60,
        value_max: null,
        updated_at: '2026-08-24T22:00:00.000Z',
      },
    ]);
    const map = await loadCoachPhraseDictionary(BigInt(1), sql);
    expect(map.get('carga media')?.value).toBe(60);
    expect(map.get('carga ligera')).toBeUndefined();
  });
});

describe('upsertCoachPhraseDictionary', () => {
  test('reemplaza el conjunto: borra y escribe solo lo relleno', async () => {
    const seen: string[] = [];
    const sql = createFakeSql((text) => {
      seen.push(text);
      return [];
    });
    await upsertCoachPhraseDictionary(
      BigInt(4),
      { entries: [{ phrase: 'carga media', as: 'competition_percent', value: 60 }] },
      sql,
    );
    expect(seen.some((t) => t.includes('delete from coach_load_phrases'))).toBe(true);
    expect(seen.filter((t) => t.includes('insert into coach_load_phrases'))).toHaveLength(1);
  });
});
