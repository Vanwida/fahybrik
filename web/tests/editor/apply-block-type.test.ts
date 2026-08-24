// Cambiar el tipo de un bloque que YA existe (card 158): mismos ejercicios,
// misma dosis, otra etiqueta de trabajo. El chip del día es un selector, no
// un adorno.

import { describe, expect, it } from 'vitest';
import {
  applyBlockType,
  selectedArchetypeId,
} from '@/lib/dashboard/v2/apply-block-type';
import type { EditorBlock, EditorItem } from '@/lib/dashboard/v2/editor-types';
import type { Prescription } from '@fahybrid/shared/domain/prescription';

let uid = 0;
function item(prescription: Prescription, name = 'Ejercicio'): EditorItem {
  uid += 1;
  return { uid: `i-${uid}`, exercise_id: uid, exercise_name: name, prescription };
}

function block(items: EditorItem[], format: string | null = 'strength_block'): EditorBlock {
  uid += 1;
  return { uid: `b-${uid}`, title: 'FUERZA TREN SUPERIOR + CORE · WARM UP', format, items };
}

const band: Prescription = {
  scheme: 'sets',
  modality: 'strength',
  sets: [{ measure: { kind: 'reps', value: 8 } }, { measure: { kind: 'reps', value: 8 } }],
};

describe('selectedArchetypeId', () => {
  it('un warmup recargado (solo format) se selecciona como calentamiento', () => {
    const b = block([item(band), item(band)], 'warmup');
    expect(selectedArchetypeId(b)).toBe('warmup');
  });

  it('series rectas con 2+ ejercicios (format sets, sin arquetipo) se leen como fuerza', () => {
    const b = block([item(band), item(band)], 'sets');
    expect(selectedArchetypeId(b)).toBe('strength');
  });
});

describe('applyBlockType — no borra lo que el coach ya escribió', () => {
  it('fuerza → calentamiento: cambia el tipo, conserva título, ejercicios y reps', () => {
    const b = block(
      [item(band, 'Band Scapular Retraction'), item(band, 'Face Pull')],
      'strength_block',
    );
    b.archetype_id = 'strength';

    const next = applyBlockType(b, 'warmup');

    expect(next.format).toBe('warmup');
    expect(next.archetype_id).toBe('warmup');
    expect(next.title).toBe(b.title);
    expect(next.items).toHaveLength(2);
    expect(next.items[0]!.exercise_name).toBe('Band Scapular Retraction');
    expect(next.items[0]!.prescription.sets).toEqual(band.sets);
    expect(next.items[0]!.prescription.scheme).toBe('warmup');
    expect(next.items[1]!.prescription.scheme).toBe('warmup');
  });

  it('calentamiento → fuerza con 2 ejercicios: format sets (no esconde el segundo)', () => {
    const b = block([item({ ...band, scheme: 'warmup' }), item({ ...band, scheme: 'warmup' })], 'warmup');
    b.archetype_id = 'warmup';

    const next = applyBlockType(b, 'strength');

    expect(next.format).toBe('sets');
    expect(next.archetype_id).toBeUndefined();
    expect(next.items).toHaveLength(2);
    expect(next.items.every((it) => it.prescription.scheme === 'sets')).toBe(true);
  });

  it('a circuito: añade la config de rondas y no borra estaciones', () => {
    const b = block([item(band), item(band), item(band)], 'warmup');
    const next = applyBlockType(b, 'circuit_core');

    expect(next.format).toBe('circuit');
    expect(next.circuit).toEqual({ rounds: 3, pacing: { kind: 'por_tarea' } });
    expect(next.items).toHaveLength(3);
  });

  it('a superserie: reutiliza la conversión de rotación (todos los items)', () => {
    const b = block([item(band, 'A'), item(band, 'B')], 'strength_block');
    const next = applyBlockType(b, 'superset');

    expect(next.format).toBe('superset');
    expect(next.archetype_id).toBe('superset');
    expect(next.items.every((it) => it.prescription.scheme === 'superset')).toBe(true);
  });

  it('el mismo tipo es un no-op (misma referencia de items)', () => {
    const b = block([item(band)], 'warmup');
    b.archetype_id = 'warmup';
    expect(applyBlockType(b, 'warmup')).toBe(b);
  });
});
