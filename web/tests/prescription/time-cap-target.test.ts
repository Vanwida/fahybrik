// time_cap — the target kind that answers "how fast", not "how hard".
//
// WHY IT EXISTS: every other Target is an intensity. A roxzone transition is not
// prescribed at a pace or a heart rate — it is prescribed as a clock to beat
// ("under 8 seconds"). Expressing that as `Measure.duration = 8s` says the
// opposite thing ("spend 8 seconds"), so the objective needed its own kind.
//
// These tests pin the two things that would silently break it: the validator
// accepting a target with no bound at all, and the renderer losing the "≤".

import { describe, expect, it } from 'vitest';
import { targetSchema } from '../../../shared/domain/prescription/types';
import { formatTarget } from '../../../shared/domain/prescription/to-text';
import { emptyTargetOfKind, targetScalar } from '../../lib/programming/prescription-model';

describe('time_cap · validación', () => {
  it('acepta un techo suelto — el caso de la roxzone', () => {
    expect(targetSchema.safeParse({ kind: 'time_cap', max_s: 8 }).success).toBe(true);
  });

  it('acepta una banda, que es lo que se aprieta al progresar', () => {
    expect(targetSchema.safeParse({ kind: 'time_cap', min_s: 6, max_s: 8 }).success).toBe(true);
  });

  it('rechaza un objetivo sin ningún límite: no diría nada', () => {
    expect(targetSchema.safeParse({ kind: 'time_cap' }).success).toBe(false);
  });

  it('rechaza una banda invertida', () => {
    expect(targetSchema.safeParse({ kind: 'time_cap', min_s: 9, max_s: 6 }).success).toBe(false);
  });

  it('rechaza campos escalares: un tope vive en los campos _s', () => {
    expect(targetSchema.safeParse({ kind: 'time_cap', value: 8 }).success).toBe(false);
  });
});

describe('time_cap · cómo se lee', () => {
  it('un techo se lee como techo, no como duración', () => {
    expect(formatTarget({ kind: 'time_cap', max_s: 8 })).toBe('≤ 0:08');
  });

  it('una banda se lee como rango', () => {
    expect(formatTarget({ kind: 'time_cap', min_s: 6, max_s: 8 })).toBe('0:06-0:08');
  });

  it('un objetivo plano se lee como reloj', () => {
    expect(formatTarget({ kind: 'time_cap', value_s: 90 })).toBe('1:30');
  });
});

describe('time_cap · en el editor', () => {
  it('nace como techo de 8 s, que es el objetivo de entrada a estación', () => {
    expect(emptyTargetOfKind('time_cap', 'functional')).toEqual({ kind: 'time_cap', max_s: 8 });
  });

  it('conserva el número al cambiar de tipo de objetivo', () => {
    expect(emptyTargetOfKind('time_cap', 'functional', 12)).toEqual({ kind: 'time_cap', max_s: 12 });
  });

  it('devuelve su escalar desde los campos _s, como el ritmo', () => {
    expect(targetScalar({ kind: 'time_cap', max_s: 8 })).toBe(8);
    expect(targetScalar({ kind: 'time_cap', min_s: 6, max_s: 8 })).toBe(6);
  });
});
