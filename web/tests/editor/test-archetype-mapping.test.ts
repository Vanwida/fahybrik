// El TIPO de un bloque Test se recupera de su prescripción — y solo de ella.
//
// El bug que se defiende (QA 15-ago): el «5K control» de la batería (carrera,
// 5000 m dentro de una estructura por fases) abría el editor como «Remo 2 km ·
// Remo · /500m», porque testTypeFromPrescription NUNCA devolvía null — toda
// prescripción que no casaba caía en cascada al default row_2k. La guarda de
// ArchetypeBlockForm («un formulario que no puede representar el contenido
// degrada al editor de items, nunca ceguera», 11-ago) esperaba un null que no
// existía. Si el coach tocaba ese selector falso y guardaba, la prescripción
// real de carrera se machacaba con un Remo 2K. El HYROX half-sim (sin dosis
// prescrita, o con contenido de sesión) sufría el mismo default.
//
// Lo que se fija aquí: (1) el 5K por distancia existe en el vocabulario cerrado
// y hace round-trip exacto; (2) lo que no es un spec de test devuelve null —
// jamás un tipo inventado de otra modalidad; (3) el fallback «más cercano»
// DENTRO de la misma modalidad+medida (un remo afinado sigue siendo Remo 2 km)
// se conserva tal cual.

import { describe, test, expect } from 'vitest';
import {
  TEST_TYPES,
  testTypeForSpec,
} from '@fahybrid/shared/domain/methodology';
import {
  prescriptionFromStructure,
  type Prescription,
  type RunStructure,
} from '@fahybrid/shared/domain/prescription';
import {
  testPrescription,
  testTypeFromPrescription,
} from '@/lib/dashboard/v2/test-template';

// La MISMA estructura por fases que la batería persiste para el «5K control»
// (TT_5K_RUN_STRUCTURE, shared/domain/coach/test-battery.ts): calentamiento +
// 5000 m a fondo + vuelta a la calma. Su flatten legacy queda en scheme
// 'intervals' con work_s=600 — sin ningún set de distancia a la vista.
const FIVE_K_CONTROL_STRUCTURE: RunStructure = [
  { role: 'warmup', elements: [{ kind: 'work', measure: { type: 'duration', s: 600 }, target: { type: 'rpe', value: 3 } }] },
  { role: 'main', elements: [{ kind: 'work', measure: { type: 'distance', m: 5000 }, target: { type: 'rpe', min: 9, max: 10 } }] },
  { role: 'cooldown', elements: [{ kind: 'work', measure: { type: 'duration', s: 600 }, target: { type: 'rpe', value: 2 } }] },
];

describe('el vocabulario cerrado de tipos de test', () => {
  test('existe la carrera por distancia: 5 km, /km, 5000 m', () => {
    const t = testTypeForSpec('run', 'distance', 5000);

    expect(t).not.toBeNull();
    expect(t!.slug).toBe('run_5k');
    expect(t!.label).toBe('Carrera 5 km');
    expect(t!.pace_unit).toBe('per_km');
  });

  test('cada tipo sigue únicamente identificado por su triple modalidad×medida×cantidad', () => {
    const triples = TEST_TYPES.map((t) => `${t.modality}|${t.measure}|${t.amount}`);

    expect(new Set(triples).size).toBe(TEST_TYPES.length);
  });

  test('todos los tipos hacen round-trip: su prescripción devuelve su tipo', () => {
    for (const t of TEST_TYPES) {
      expect(testTypeFromPrescription(testPrescription(t))?.slug).toBe(t.slug);
    }
  });
});

describe('lo que NO es un spec de test devuelve null — nunca un Remo 2K inventado', () => {
  test('el «5K control» real de la batería (estructura por fases) no reclama ningún tipo', () => {
    const p = prescriptionFromStructure(FIVE_K_CONTROL_STRUCTURE);

    // Sanity: es la forma que persiste la batería (flatten a intervals).
    expect(p.modality).toBe('run');
    expect(p.structure).toBeDefined();

    // Antes: row_2k (el editor pintaba «Remo 2 km» sobre una carrera de 5000 m).
    expect(testTypeFromPrescription(p)).toBeNull();
  });

  test('sin prescripción (el half-sim genérico persiste prescription_json NULL) → null', () => {
    expect(testTypeFromPrescription(undefined)).toBeNull();
  });

  test('una modalidad que ningún test mide (fuerza, funcional) → null', () => {
    const strength: Prescription = {
      scheme: 'steady',
      modality: 'strength',
      sets: [{ measure: { kind: 'reps', value: 5 } }],
    };
    const functional: Prescription = {
      scheme: 'steady',
      modality: 'functional',
      sets: [{ measure: { kind: 'reps', value: 20 } }],
    };

    expect(testTypeFromPrescription(strength)).toBeNull();
    expect(testTypeFromPrescription(functional)).toBeNull();
  });

  test('un intervals de carrera sin estructura (legacy) tampoco se disfraza de test', () => {
    const p: Prescription = {
      scheme: 'intervals',
      modality: 'run',
      rounds: 5,
      work_s: 180,
      rest_s: 90,
    };

    expect(testTypeFromPrescription(p)).toBeNull();
  });

  test('un steady que no fija ni distancia ni tiempo → null', () => {
    const p: Prescription = { scheme: 'steady', modality: 'run' };

    expect(testTypeFromPrescription(p)).toBeNull();
  });
});

describe('el fallback dentro de la misma familia se conserva', () => {
  test('remo 2000 m exacto → Remo 2 km (intacto)', () => {
    const p: Prescription = {
      scheme: 'steady',
      modality: 'row',
      sets: [{ measure: { kind: 'distance', meters: 2000 } }],
      target: { kind: 'rpe', value: 10 },
    };

    expect(testTypeFromPrescription(p)?.slug).toBe('row_2k');
  });

  test('remo con cantidad afinada (2500 m) → sigue resolviendo a Remo 2 km', () => {
    const p: Prescription = {
      scheme: 'steady',
      modality: 'row',
      sets: [{ measure: { kind: 'distance', meters: 2500 } }],
      target: { kind: 'rpe', value: 10 },
    };

    expect(testTypeFromPrescription(p)?.slug).toBe('row_2k');
  });

  test('carrera 9 min exacta → Carrera 9′ (intacto)', () => {
    const p: Prescription = {
      scheme: 'steady',
      modality: 'run',
      total_s: 540,
      target: { kind: 'rpe', value: 10 },
    };

    expect(testTypeFromPrescription(p)?.slug).toBe('run_9min');
  });

  test('carrera por distancia afinada (4000 m) → resuelve a Carrera 5 km, no a remo', () => {
    const p: Prescription = {
      scheme: 'steady',
      modality: 'run',
      sets: [{ measure: { kind: 'distance', meters: 4000 } }],
      target: { kind: 'rpe', value: 10 },
    };

    expect(testTypeFromPrescription(p)?.slug).toBe('run_5k');
  });
});
