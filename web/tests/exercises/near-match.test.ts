// near-match — tests PUROS (sin DB) de la coincidencia aproximada de nombres.
//
// Los casos NO son inventados: son los 30 nombres reales que la semana 12 de la
// captura deja sin resolver (tests/import/photo-e2e.test.ts). Lo que se fija aquí
// es lo que el resolutor del importador NO puede cazar y por qué hoy se crean
// duplicados: el orden de las palabras, los acentos y un matiz de más.

import { describe, expect, test } from 'vitest';
import {
  findNearMatches,
  nameSimilarity,
  nameTokens,
  type NearMatchCandidate,
} from '@/lib/dashboard/exercises/near-match';

/** Un catálogo mínimo pero REAL en su forma: lo que un coach ya tendría. */
const CATALOGO: NearMatchCandidate[] = [
  { id: 1, name: 'Dominada', modality: 'strength', category: 'strength' },
  { id: 2, name: 'Dominada australiana', modality: 'strength', category: 'strength' },
  { id: 3, name: 'Remo con barra', modality: 'strength', category: 'strength' },
  { id: 4, name: 'Remo en ergómetro', modality: 'row', category: 'cardio' },
  { id: 5, name: 'Puente de glúteo', modality: 'strength', category: 'strength' },
  { id: 6, name: 'Sentadilla cossack', modality: 'mobility', category: 'mobility' },
  { id: 7, name: 'Press de banca', modality: 'strength', category: 'strength' },
  { id: 8, name: 'Plancha lateral', modality: 'core', category: 'core' },
];

describe('nameTokens — cómo se parte un nombre para compararlo', () => {
  test('quita acentos, minúsculas y palabras vacías', () => {
    expect(nameTokens('Puente de glúteo')).toEqual(['puente', 'gluteo']);
  });

  test('los paréntesis se ABREN, no se tiran: el matiz también es una palabra', () => {
    expect(nameTokens('Dominada (lastrada)')).toEqual(['dominada', 'lastrada']);
  });

  test('un nombre que es todo palabras vacías se queda con lo que tenga', () => {
    expect(nameTokens('de la')).toEqual(['de', 'la']);
  });
});

describe('lo que el resolutor NO caza y aquí sí', () => {
  test('los ACENTOS: hoy «Puente de glúteo» del catálogo nunca casa con el término sin tilde', () => {
    // La capa 3 del resolutor compara `lower(name)` en SQL contra un término ya
    // desacentuado, así que este par no puede resolver nunca y se crea duplicado.
    expect(nameSimilarity('Puente de gluteo', 'Puente de glúteo')).toBe(1);
  });

  test('el ORDEN de las palabras', () => {
    expect(nameSimilarity('Squat Cossack', 'Cossack Squat')).toBe(1);
  });

  test('un matiz de más sigue pareciéndose, pero menos', () => {
    const con = nameSimilarity('Puente de glúteo a una pierna', 'Puente de glúteo');
    expect(con).toBeLessThan(1);
    // Se sigue PROPONIENDO: «a una pierna» puede ser un matiz o puede ser otro
    // ejercicio, y eso lo decide el coach, no la cadena.
    expect(findNearMatches('Puente de glúteo a una pierna', CATALOGO)[0]?.name).toBe(
      'Puente de glúteo',
    );
  });

  test('el SINGULAR y el PLURAL son la variación real, y sin esto valían cero', () => {
    expect(nameSimilarity('Dominadas', 'Dominada')).toBe(1);
    expect(nameSimilarity('Banded Front Raises', 'Banded Front Raise')).toBe(1);
    // Pero una cola larga NO es un plural: son ejercicios distintos.
    expect(nameSimilarity('Pull', 'Pullover')).toBe(0);
  });
});

describe('lo que NO debe fusionar — es lo que hace peligroso el parecido', () => {
  test('«Remo» no se traga un «Remo con barra en punta»: Jaccard castiga el tamaño', () => {
    // Con «cuántas del corto están en el largo» esto daría 1,0 y fusionaría el
    // ergómetro dentro de un ejercicio de fuerza.
    expect(nameSimilarity('Remo', 'Remo con barra en punta')).toBeLessThan(0.5);
  });

  test('dos nombres que solo comparten palabras vacías no se parecen en nada', () => {
    expect(nameSimilarity('Press de banca', 'Puente de glúteo')).toBe(0);
  });

  test('los candidatos viajan con su MODALIDAD, que es lo que decide la fusión', () => {
    const hits = findNearMatches('Remo', CATALOGO, { floor: 0.3 });
    const modalidades = hits.map((h) => h.modality);
    // Aparecen los dos «Remo», y son de modalidades distintas: fusionar el
    // ergómetro dentro del de barra mandaría al atleta por otra ruta en vivo.
    expect(new Set(modalidades).size).toBeGreaterThan(1);
  });
});

describe('los nombres reales de la semana 12', () => {
  test('«Dominada (lastrada)» propone «Dominada», que es el caso de fusión', () => {
    const [mejor] = findNearMatches('Dominada (lastrada)', CATALOGO);
    expect(mejor?.name).toBe('Dominada');
  });

  test('empate a parecido: gana el nombre más corto, que es la apuesta genérica', () => {
    const hits = findNearMatches('Dominadas', CATALOGO, { floor: 0.3 });
    expect(hits[0]!.name).toBe('Dominada');
  });

  test('«Cossack Squat» encuentra la «Sentadilla cossack» que ya existe', () => {
    const [mejor] = findNearMatches('Cossack Squat', CATALOGO, { floor: 0.3 });
    expect(mejor?.name).toBe('Sentadilla cossack');
  });

  test('los que de verdad NO están no proponen nada: crear es lo correcto', () => {
    for (const nuevo of [
      'Cable External Rotation',
      'Band Pull Apart',
      'Prone Y Raise',
      'Cat Cow',
      'Bird Dog',
      'Cobra Pose',
      'Hip Flexor Stretch',
      'Forward Leg Swing',
      'Push Jerk',
    ]) {
      expect(findNearMatches(nuevo, CATALOGO)).toEqual([]);
    }
  });

  test('nunca devuelve más de tres, aunque muchos se parezcan', () => {
    const muchos: NearMatchCandidate[] = Array.from({ length: 10 }, (_, i) => ({
      id: 100 + i,
      name: `Dominada variante ${i}`,
      modality: 'strength',
      category: 'strength',
    }));
    expect(findNearMatches('Dominada', muchos, { floor: 0.1 })).toHaveLength(3);
  });
});
