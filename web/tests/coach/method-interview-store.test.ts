/**
 * Persistencia de la entrevista: sin fila → vacío; guardar escribe columnas
 * explícitas y regenera el espejo.
 */
import { describe, expect, test } from 'vitest';
import { createFakeSql } from '../utils/fake-sql';
import {
  getCoachMethodInterview,
  loadCoachMethodMirror,
  upsertCoachMethodInterview,
} from '@/lib/coach/method-interview';
import {
  emptyInterview,
  normalizeAnswers,
  specExampleAnswers,
  SPEC_EXAMPLE_MIRROR,
} from '@fahybrid/shared/domain/coach/method-interview';

describe('getCoachMethodInterview', () => {
  test('sin fila: espejo vacío, answered 0, updated_at null', async () => {
    const res = await getCoachMethodInterview(BigInt(1), createFakeSql(() => []));
    expect(res.answered_count).toBe(0);
    expect(res.generated_mirror).toBe('');
    expect(res.mirror_text).toBe('');
    expect(res.updated_at).toBeNull();
    expect(res.answers.typical_day).toBeNull();
  });

  test('con fila: sirve casillas y el párrafo', async () => {
    const answers = normalizeAnswers(specExampleAnswers());
    const fake = createFakeSql((text) => {
      if (text.includes('from coach_method_interview')) {
        return [
          {
            ...answers,
            generated_mirror: SPEC_EXAMPLE_MIRROR,
            mirror_text: SPEC_EXAMPLE_MIRROR,
            updated_at: '2026-08-17T10:00:00.000Z',
          },
        ];
      }
      return [];
    });
    const res = await getCoachMethodInterview(BigInt(3), fake);
    expect(res.mirror_text).toBe(SPEC_EXAMPLE_MIRROR);
    expect(res.answered_count).toBe(13);
    expect(res.updated_at).toBe('2026-08-17T10:00:00.000Z');
  });
});

describe('loadCoachMethodMirror', () => {
  test('vacío si no hay fila', async () => {
    expect(await loadCoachMethodMirror(BigInt(1), createFakeSql(() => []))).toBe('');
  });

  test('con fila: el párrafo que leen los composers', async () => {
    const answers = normalizeAnswers(specExampleAnswers());
    const fake = createFakeSql((text) => {
      if (text.includes('from coach_method_interview')) {
        return [
          {
            ...answers,
            generated_mirror: SPEC_EXAMPLE_MIRROR,
            mirror_text: SPEC_EXAMPLE_MIRROR,
            updated_at: '2026-08-17T10:00:00.000Z',
          },
        ];
      }
      return [];
    });
    expect(await loadCoachMethodMirror(BigInt(3), fake)).toBe(SPEC_EXAMPLE_MIRROR);
  });
});

describe('upsertCoachMethodInterview', () => {
  test('inserta la fila y devuelve el espejo generado', async () => {
    let inserted = false;
    const fake = createFakeSql((text) => {
      if (text.includes('from coach_method_interview') && text.includes('select')) {
        return [];
      }
      if (text.includes('insert into coach_method_interview')) {
        inserted = true;
        expect(text).toContain('on conflict (coach_id) do update');
        return [{ updated_at: '2026-08-17T11:00:00.000Z' }];
      }
      return [];
    });

    const res = await upsertCoachMethodInterview(
      BigInt(7),
      { answers: normalizeAnswers(specExampleAnswers()) },
      fake,
    );

    expect(inserted).toBe(true);
    expect(res.generated_mirror).toBe(SPEC_EXAMPLE_MIRROR);
    expect(res.mirror_is_edited).toBe(false);
    expect(res.updated_at).toBe('2026-08-17T11:00:00.000Z');
  });
});

describe('empty interview shape', () => {
  test('todas las claves existen y son null', () => {
    const empty = emptyInterview().answers;
    expect(empty.majority_work).toBeNull();
    expect(empty.tests_used).toBeNull();
    expect(empty.typical_day_other).toBeNull();
  });
});
