// La SUPERSERIE como tipo de bloque del editor.
//
// Un formato que el coach no puede escribir a mano está huérfano: `superset` entró
// en el catálogo canónico, así que tiene que poder nacer del selector igual que
// nace de una foto. Lo que se defiende aquí es eso y las dos trampas del camino:
// que la rotación sobreviva a la edición (el esquema no puede volver a `sets`) y
// que un bloque recargado encuentre su formulario.

import { describe, test, expect } from 'vitest';
import {
  ARCHETYPES,
  archetypeForFormat,
  createBlockFromArchetype,
  patternForBlock,
  seedArchetype,
} from '@/lib/dashboard/v2/archetypes';
import { safeParsePrescription } from '@fahybrid/shared/domain/prescription';

describe('el tipo de bloque existe y se puede elegir', () => {
  test('la superserie está en el selector, emparejada con fuerza', () => {
    const sup = ARCHETYPES.find((a) => a.id === 'superset');

    expect(sup).toBeDefined();
    expect(sup!.name).toBe('Superserie');
    expect(sup!.format).toBe('superset');
    expect(sup!.pattern).toBe('superset');
    // Misma familia que su pareja: una superserie de dos levantamientos sigue
    // siendo trabajo de fuerza.
    expect(sup!.modalitySlug).toBe('fuerza');
    // Sin icono de chispas ni clichés de IA.
    expect(sup!.icon).toBe('swap_horiz');
  });

  test('nace con DOS ejercicios: con uno solo no hay nada que alternar', () => {
    const block = createBlockFromArchetype('superset');

    expect(block.items).toHaveLength(2);
    expect(block.format).toBe('superset');
    expect(block.archetype_id).toBe('superset');
    expect(block.title).toBe('Superserie');
  });

  test('los dos ejercicios NO comparten la misma prescripción por referencia', () => {
    const block = createBlockFromArchetype('superset');
    const [a1, a2] = block.items;

    expect(a1!.prescription).not.toBe(a2!.prescription);
    expect(a1!.uid).not.toBe(a2!.uid);

    // Editar uno no puede tocar al otro.
    a1!.prescription.sets = [{ measure: { kind: 'reps', value: 99 } }];
    expect(a2!.prescription.sets).not.toEqual(a1!.prescription.sets);
  });

  test('los demás tipos siguen naciendo con UN ejercicio', () => {
    for (const id of ['strength', 'steady_run', 'intervals'] as const) {
      expect(createBlockFromArchetype(id).items).toHaveLength(1);
    }
  });
});

describe('la semilla', () => {
  test('el descanso es el de la VUELTA: vive en el bloque, no en cada serie', () => {
    const p = seedArchetype('superset');

    expect(p.scheme).toBe('superset');
    expect(p.rest_s).toBe(90);
    // Ninguna serie lleva su propio descanso: encadenarlas es lo que define la
    // superserie, así que dos descansos con sentidos distintos se contradirían.
    expect((p.sets ?? []).every((s) => s.rest_s === undefined)).toBe(true);
  });

  test('la semilla trae su tabla de series y es una prescripción válida', () => {
    const p = seedArchetype('superset');

    expect((p.sets ?? []).length).toBeGreaterThan(0);
    expect(safeParsePrescription(p).success).toBe(true);
  });

  test('cada llamada devuelve un objeto nuevo', () => {
    expect(seedArchetype('superset')).not.toBe(seedArchetype('superset'));
  });

  test('la fuerza sigue igual: series rectas y su descanso por serie', () => {
    const p = seedArchetype('strength');

    expect(p.scheme).toBe('sets');
    expect(safeParsePrescription(p).success).toBe(true);
  });
});

describe('un bloque recargado encuentra su formulario', () => {
  test('el formato superset resuelve a su arquetipo', () => {
    expect(archetypeForFormat('superset')?.id).toBe('superset');
  });

  test('sin archetype_id (recarga o import de foto) el patrón sale del formato', () => {
    // Este es el caso real: una superserie importada de una foto se guarda con su
    // formato pero sin el archetype_id, que es solo de cliente.
    expect(patternForBlock(undefined, 'superset')).toBe('superset');
    // Y no se confunde con su pareja.
    expect(patternForBlock(undefined, 'strength_block')).toBe('sets_table');
  });
});
