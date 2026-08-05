// bulk-create — tests PUROS de las dos guardas contra el duplicado.
//
// Por qué hacen falta: `createExercise` NO detecta duplicados. Un nombre repetido
// se absorbe en silencio como `dominada-2`, y el catálogo del coach se llena de
// gemelos que él no ve venir. La pantalla PROPONE fusionar, pero una propuesta se
// ignora de un clic — así que lo idéntico se rechaza en el servidor.

import { describe, expect, test } from 'vitest';
import { exactNameCollisions, isSameExerciseName } from '@/lib/dashboard/exercises/bulk-create';

const CATALOGO = [
  { name: 'Dominada' },
  { name: 'Puente de glúteo' },
  { name: 'Press de banca' },
];

describe('isSameExerciseName — cuándo dos nombres son el mismo ejercicio', () => {
  test('el orden de las palabras no cambia el ejercicio', () => {
    expect(isSameExerciseName('Cossack Squat', 'Squat Cossack')).toBe(true);
  });

  test('ni los acentos, ni las mayúsculas, ni las palabras vacías', () => {
    expect(isSameExerciseName('PUENTE DE GLÚTEO', 'puente gluteo')).toBe(true);
  });

  test('ni el plural, que es el duplicado más común que hay', () => {
    expect(isSameExerciseName('Dominadas', 'Dominada')).toBe(true);
  });

  test('pero un matiz de más SÍ lo cambia', () => {
    expect(isSameExerciseName('Dominada', 'Dominada a una mano')).toBe(false);
  });
});

describe('no se crea lo que ya existe', () => {
  test('un nombre idéntico al del catálogo se caza, aunque venga escrito distinto', () => {
    const choques = exactNameCollisions(['puente de gluteo'], CATALOGO);
    expect(choques).toEqual([{ name: 'puente de gluteo', existing: 'Puente de glúteo' }]);
  });

  test('el plural también: «Dominadas» es «Dominada»', () => {
    // El mismo caso que la fusión: comparando cadenas enteras esto pasaría.
    expect(exactNameCollisions(['Dominadas'], CATALOGO)).toHaveLength(1);
  });

  test('lo que solo se PARECE no se bloquea: es otro ejercicio y el coach manda', () => {
    expect(exactNameCollisions(['Dominada a una mano'], CATALOGO)).toEqual([]);
    expect(exactNameCollisions(['Puente de glúteo a una pierna'], CATALOGO)).toEqual([]);
  });

  test('lo que de verdad es nuevo pasa', () => {
    expect(exactNameCollisions(['Cat Cow', 'Bird Dog', 'Push Jerk'], CATALOGO)).toEqual([]);
  });

  test('con el catálogo vacío no choca nada', () => {
    expect(exactNameCollisions(['Cat Cow'], [])).toEqual([]);
  });
});
