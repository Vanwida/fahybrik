/**
 * El catálogo de tests × la deducción de qué mide cada uno. Puro, sin DB.
 *
 * Cubre lo que un catálogo mal montado rompería en silencio: un preset que dice
 * «calibra tus zonas de remo» pero cuyo contenido no está anclado en el
 * protocolo, o una estación que guarda repeticiones con la unidad de otra cosa.
 */
import { describe, expect, test } from 'vitest';
import {
  TEST_PRESETS,
  TEST_PRESETS_BY_FAMILY,
  type TestPreset,
} from '@fahybrid/shared/domain/coach/test-catalog';
import {
  derivedMeasureFor,
  calibrationLabelFor,
  deriveStoreResults,
} from '@fahybrid/shared/domain/coach/test-derive';

const byId = (id: string): TestPreset => {
  const p = TEST_PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`preset no encontrado: ${id}`);
  return p;
};

// El slug importa: es lo que ancla el 1RM a su benchmark (EXERCISE_TO_1RM_BENCHMARK).
// Sin él, un preset de fuerza no puede calibrar — como en el flujo real, donde el
// slug se resuelve contra el catálogo de ejercicios.
const item = (p: TestPreset) => ({
  exercise_name: p.exerciseLabel,
  exercise_slug: p.exercise[0] ?? null,
  prescription: p.prescription,
});

describe('catálogo de tests · qué mide cada preset', () => {
  test('todo preset mide ALGO — un atajo que no promete resultado no sirve de atajo', () => {
    for (const p of TEST_PRESETS) {
      const fuentes = p.stations ?? [p];
      for (const st of fuentes) {
        const d = derivedMeasureFor({ exercise_name: p.exerciseLabel, prescription: st.prescription });
        expect(d, `${p.id} · ${'label' in st ? String(st.label) : ''}`).not.toBeNull();
      }
    }
  });

  test('fijas distancia → tiempo; fijas reloj → distancia; 1RM → carga', () => {
    expect(derivedMeasureFor(item(byId('Remo 2 km')))?.measure).toBe('time');
    expect(derivedMeasureFor(item(byId('Cooper · 12 min')))?.measure).toBe('distance');
    expect(derivedMeasureFor(item(byId('Sentadilla · 1RM')))?.measure).toBe('load');
  });

  test('la unidad casa con la medida — nunca repeticiones en metros', () => {
    for (const p of TEST_PRESETS) {
      const fuentes = p.stations ?? [p];
      for (const st of fuentes) {
        const d = derivedMeasureFor({ exercise_name: p.exerciseLabel, prescription: st.prescription });
        if (!d) continue;
        const esperado: Record<string, string> = {
          time: 'seconds', distance: 'meters', load: 'kg', reps: 'reps', calories: 'calories',
        };
        expect(d.unit, `${p.id} mide ${d.measure}`).toBe(esperado[d.measure]);
      }
    }
  });

  test('la promesa de la tarjeta no miente: dice «calibra» solo si calibra de verdad', () => {
    for (const p of TEST_PRESETS) {
      if (p.stations) continue; // un protocolo no promete calibración en su hint
      const calibra = calibrationLabelFor(item(p));
      const loDice = p.hint.includes('calibra');
      expect(loDice, `${p.id} → hint «${p.hint}»`).toBe(calibra !== null);
    }
  });

  test('solo los tres protocolos anclados calibran zonas', () => {
    expect(calibrationLabelFor(item(byId('Remo 2 km')))).toBe('tus zonas de remo');
    expect(calibrationLabelFor(item(byId('Ski 1 km')))).toBe('tus zonas de ski');
    expect(calibrationLabelFor(item(byId('5 km')))).toBe('tus zonas de carrera');
    // Un 1 km de remo es una marca válida, pero la fórmula está anclada en 2 km.
    expect(calibrationLabelFor(item(byId('Remo 1 km')))).toBeNull();
    expect(calibrationLabelFor(item(byId('Remo 500 m')))).toBeNull();
    expect(calibrationLabelFor(item(byId('3 km')))).toBeNull();
  });
});

describe('HYROX Conditioning Test · el protocolo verificado', () => {
  const hct = byId('HYROX Conditioning Test');

  test('son las 5 estaciones, en orden', () => {
    expect(hct.stations?.map((s) => s.label)).toEqual([
      '8 min remo',
      '4 min burpees con salto',
      '4 min zancadas',
      '8 min ski',
      '4 min wall balls',
    ]);
  });

  test('los tiempos suman los 34:00 que declara el protocolo', () => {
    const segundos = (hct.stations ?? []).reduce((tot, st) => {
      const m = st.prescription.sets?.[0]?.measure;
      const trabajo = m && m.kind === 'duration' ? m.seconds : 0;
      const descanso = st.prescription.sets?.[0]?.rest_s ?? 0;
      return tot + trabajo + descanso;
    }, 0);
    expect(segundos).toBe(34 * 60);
  });

  test('en los ergos cuentan los METROS; en el resto, las REPETICIONES', () => {
    const medidas = (hct.stations ?? []).map(
      (st) => derivedMeasureFor({ exercise_name: st.exerciseLabel, prescription: st.prescription })?.measure,
    );
    expect(medidas).toEqual(['distance', 'reps', 'reps', 'distance', 'reps']);
  });

  test('el contrato de resultados sale con una entrada por estación, sin colisiones', () => {
    const specs = deriveStoreResults(
      'hct',
      (hct.stations ?? []).map((st) => ({
        exercise_name: st.exerciseLabel,
        prescription: st.prescription,
      })),
    );
    expect(specs).toHaveLength(5);
    expect(new Set(specs.map((s) => s.slug)).size).toBe(5);
    // Ninguna estación del HCT calibra zonas: son ventanas de tiempo, no los
    // protocolos anclados (2 km remo / 1 km ski / 5 km carrera).
    expect(specs.every((s) => s.derives === 'none')).toBe(true);
  });

  test('el protocolo viaja como nota, para que el atleta sepa qué hará', () => {
    expect(hct.note).toContain('34 min');
    expect(hct.note).toContain('wall balls');
  });
});

describe('familias del catálogo', () => {
  test('HYROX primero: hay simulación y las ocho estaciones oficiales', () => {
    expect(TEST_PRESETS_BY_FAMILY.simulacion.length).toBeGreaterThanOrEqual(2);
    expect(TEST_PRESETS_BY_FAMILY.estaciones).toHaveLength(8);
  });

  test('los seis levantamientos que el motor sabe resolver', () => {
    expect(TEST_PRESETS_BY_FAMILY.fuerza).toHaveLength(6);
  });
});
