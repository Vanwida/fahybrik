import { describe, expect, test } from 'vitest';
import { loadCoachMaxMicrocicloWeeks } from '@/lib/coach/microcycle-limits';
import { MICROCICLO_DEFAULT_MAX_WEEKS } from '@fahybrid/shared/domain/coach/program-months';
import { createFakeSql } from '../utils/fake-sql';

function missingColumnError(): Error {
  return Object.assign(new Error('column "max_microcycle_weeks" does not exist'), {
    code: '42703',
  });
}

describe('loadCoachMaxMicrocicloWeeks', () => {
  test('columna 0206 ausente (42703) → defecto 8, no tira', async () => {
    const client = createFakeSql(() => {
      throw missingColumnError();
    });
    await expect(loadCoachMaxMicrocicloWeeks({ coach_id: 60, client })).resolves.toBe(
      MICROCICLO_DEFAULT_MAX_WEEKS,
    );
  });

  test('lee el tope del coach cuando la columna existe', async () => {
    const client = createFakeSql(() => [{ max_microcycle_weeks: 3 }]);
    await expect(loadCoachMaxMicrocicloWeeks({ coach_id: 60, client })).resolves.toBe(3);
  });

  test('sin fila de coach → defecto 8', async () => {
    const client = createFakeSql(() => []);
    await expect(loadCoachMaxMicrocicloWeeks({ coach_id: 60, client })).resolves.toBe(
      MICROCICLO_DEFAULT_MAX_WEEKS,
    );
  });

  test('un error que no es de esquema sigue saliendo', async () => {
    const client = createFakeSql(() => {
      throw Object.assign(new Error('too many connections'), { code: '53300' });
    });
    await expect(loadCoachMaxMicrocicloWeeks({ coach_id: 60, client })).rejects.toMatchObject({
      code: '53300',
    });
  });
});
