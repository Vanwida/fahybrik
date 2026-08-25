import { describe, expect, test } from 'vitest';
import {
  dictionaryFromRows,
  lookupPhrase,
  mappingToTarget,
  phraseKeyFrom,
} from '@fahybrid/shared/domain/coach/phrase-dictionary';

describe('diccionario de frases de carga', () => {
  test('la clave ignora mayúsculas y acentos', () => {
    expect(phraseKeyFrom('Carga Media')).toBe('carga media');
    expect(phraseKeyFrom('  CARGA   LIGERA ')).toBe('carga ligera');
  });

  test('mapa vacío no inventa un significado', () => {
    const dict = dictionaryFromRows([]);
    expect(lookupPhrase(dict, 'carga media')).toBeNull();
  });

  test('una vez guardada, la misma frase se reutiliza', () => {
    const dict = dictionaryFromRows([
      { phrase: 'carga media', phrase_key: 'carga media', as: 'competition_percent', value: 60 },
    ]);
    expect(lookupPhrase(dict, 'Carga media')?.value).toBe(60);
    expect(
      mappingToTarget(lookupPhrase(dict, 'carga media')!, 'hyrox-sled-push'),
    ).toEqual({
      kind: 'relative',
      ref: { of: 'competition_load', station: 'hyrox-sled-push' },
      percent: 60,
    });
  });

  test('competition_percent sin estación no se completa', () => {
    const mapped = {
      phrase: 'carga media',
      phrase_key: 'carga media',
      as: 'competition_percent' as const,
      value: 60,
    };
    expect(mappingToTarget(mapped)).toBeNull();
  });

  test('kilos fijos no piden estación', () => {
    const mapped = {
      phrase: 'carga pesada',
      phrase_key: 'carga pesada',
      as: 'kg' as const,
      value: 80,
    };
    expect(mappingToTarget(mapped)).toEqual({ kind: 'kg', value: 80 });
  });
});
