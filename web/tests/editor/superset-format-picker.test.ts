// El picker «Series rectas | Superserie» del compositor (fase 2, ago-2026) y
// las etiquetas A1/A2 de la hoja del día — DECISIONS.md 2026-08-05: la
// superserie es una decisión de BLOQUE (todo el bloque rota o ninguno), y su
// scheme no puede degradarse a `sets` en silencio (el bug real que ya se
// arregló una vez en `StrengthFields`). Lo que se defiende aquí:
//   1. el picker solo aparece donde tiene sentido (fuerza, ≥2 ejercicios, ya
//      en `sets`/`superset` — nunca sobre un EMOM o un circuito);
//   2. convertir normaliza TODOS los items del bloque, nunca uno suelto;
//   3. las etiquetas de fila leen la rotación del `scheme` real, no de un
//      `format` que puede quedarse desfasado.

import { describe, expect, it } from 'vitest';
import {
  applyBlockFormat,
  canPickBlockFormat,
} from '@/components/v2/editor/compositor-chrome';
import { blockIsSuperset, rowTag } from '@/components/v2/editor/BlockItemTable';
import type { EditorBlock, EditorItem } from '@/lib/dashboard/v2/editor-types';
import type { Prescription } from '../../../shared/domain/prescription';

let uid = 0;
function item(prescription: Prescription, name = 'Ejercicio'): EditorItem {
  uid += 1;
  return { uid: `i-${uid}`, exercise_id: uid, exercise_name: name, prescription };
}

function block(items: EditorItem[], format: string | null = 'strength_block'): EditorBlock {
  uid += 1;
  return { uid: `b-${uid}`, title: 'Bloque', format, items };
}

const strengthSets = (rest_s?: number): Prescription => ({
  scheme: 'sets',
  modality: 'strength',
  sets: [
    { measure: { kind: 'reps', value: 8 }, ...(rest_s !== undefined ? { rest_s } : {}) },
    { measure: { kind: 'reps', value: 8 }, ...(rest_s !== undefined ? { rest_s } : {}) },
  ],
});

describe('canPickBlockFormat — solo donde tiene sentido', () => {
  it('no aparece con un solo ejercicio', () => {
    const b = block([item(strengthSets())]);
    expect(canPickBlockFormat(b)).toBe(false);
  });

  it('no aparece si la modalidad no es fuerza/funcional', () => {
    const run: Prescription = { scheme: 'steady', modality: 'run', total_s: 1800 };
    const b = block([item(run), item(run)]);
    expect(canPickBlockFormat(b)).toBe(false);
  });

  it('no aparece sobre un EMOM/circuito aunque lleve un ejercicio de fuerza', () => {
    const emom: Prescription = {
      scheme: 'emom',
      modality: 'strength',
      rounds: 10,
      work_s: 60,
      sets: [{ measure: { kind: 'reps', value: 5 } }],
    };
    const b = block([item(emom), item(emom)]);
    expect(canPickBlockFormat(b)).toBe(false);
  });

  it('aparece con fuerza y 2+ ejercicios en series rectas', () => {
    const b = block([item(strengthSets(90)), item(strengthSets(90))]);
    expect(canPickBlockFormat(b)).toBe(true);
  });

  it('aparece con fuerza y 2+ ejercicios ya en superserie', () => {
    const sup: Prescription = { ...strengthSets(), scheme: 'superset', rest_s: 90 };
    const b = block([item(sup), item(sup)], 'superset');
    expect(canPickBlockFormat(b)).toBe(true);
  });

  it('funcional cuenta como fuerza (isStrengthModality: strength | functional)', () => {
    const func: Prescription = { ...strengthSets(), modality: 'functional' };
    const b = block([item(func), item(func)]);
    expect(canPickBlockFormat(b)).toBe(true);
  });
});

describe('applyBlockFormat — decisión de BLOQUE, no de ejercicio suelto', () => {
  it('a superserie: format + archetype_id + TODOS los items pasan a superset', () => {
    const b = block([item(strengthSets(90), 'Press banca'), item(strengthSets(90), 'Dominada')]);

    const next = applyBlockFormat(b, true);

    expect(next.format).toBe('superset');
    expect(next.archetype_id).toBe('superset');
    for (const it of next.items) {
      expect(it.prescription.scheme).toBe('superset');
    }
    // Los ejercicios y su trabajo (reps) sobreviven — solo cambia el scheme.
    expect(next.items[0]!.exercise_name).toBe('Press banca');
    expect(next.items[1]!.exercise_name).toBe('Dominada');
  });

  it('a superserie: el descanso por serie sube al bloque (la vuelta), no se inventa', () => {
    const b = block([item(strengthSets(90)), item(strengthSets(90))]);

    const next = applyBlockFormat(b, true);

    expect(next.items[0]!.prescription.rest_s).toBe(90);
    for (const it of next.items) {
      expect((it.prescription.sets ?? []).every((s) => s.rest_s === undefined)).toBe(true);
    }
  });

  it('a superserie: sin descanso previo no se inventa uno (CONTRATO-UI §7)', () => {
    const b = block([item(strengthSets()), item(strengthSets())]);
    const next = applyBlockFormat(b, true);
    expect(next.items[0]!.prescription.rest_s).toBeUndefined();
  });

  it('a series rectas con 2+ ejercicios: format "sets" SIN archetype_id — el arquetipo strength solo edita el primer item', () => {
    // Si esto fijara archetype_id:'strength', patternForBlock resolvería
    // sets_table y ArchetypeBlockForm solo pintaría block.items[0]: el
    // segundo ejercicio se volvería invisible en el compositor (seguiría
    // en la hoja del día, pero sin forma de abrirlo). El editor por-item
    // (legacy) sí edita todos — el mismo camino que ya usan los bloques
    // importados sin tipar.
    const sup: Prescription = { scheme: 'superset', modality: 'strength', rest_s: 90, sets: strengthSets().sets };
    const b = block([item(sup), item(sup)], 'superset');

    const next = applyBlockFormat(b, false);

    expect(next.format).toBe('sets');
    expect(next.archetype_id).toBeUndefined();
    for (const it of next.items) {
      expect(it.prescription.scheme).toBe('sets');
    }
  });

  it('a series rectas con UN solo ejercicio: sí vuelve al arquetipo strength (sets_table es seguro con un item)', () => {
    const sup: Prescription = { scheme: 'superset', modality: 'strength', rest_s: 90, sets: strengthSets().sets };
    const b = block([item(sup)], 'superset');

    const next = applyBlockFormat(b, false);

    expect(next.format).toBe('strength_block');
    expect(next.archetype_id).toBe('strength');
    expect(next.items[0]!.prescription.scheme).toBe('sets');
  });

  it('ida y vuelta no pierde el ejercicio ni degrada el scheme a mitad de camino', () => {
    const b = block([item(strengthSets(90), 'Sentadilla'), item(strengthSets(90), 'Peso muerto')]);

    const toSuper = applyBlockFormat(b, true);
    expect(toSuper.items.every((it) => it.prescription.scheme === 'superset')).toBe(true);

    const backToSets = applyBlockFormat(toSuper, false);
    expect(backToSets.items.every((it) => it.prescription.scheme === 'sets')).toBe(true);
    expect(backToSets.items.map((it) => it.exercise_name)).toEqual(['Sentadilla', 'Peso muerto']);

    // Y el picker sigue disponible: se puede volver a superserie otra vez.
    expect(canPickBlockFormat(backToSets)).toBe(true);
  });
});

describe('rowTag / blockIsSuperset — la hoja del día lee la rotación, no adivina', () => {
  it('series rectas: A, B, C…', () => {
    expect(rowTag(0, false)).toBe('A');
    expect(rowTag(1, false)).toBe('B');
    expect(rowTag(25, false)).toBe('Z');
    expect(rowTag(26, false)).toBe('27');
  });

  it('superserie: A1, A2, A3… (la grafía real del coach, no un tercer sistema)', () => {
    expect(rowTag(0, true)).toBe('A1');
    expect(rowTag(1, true)).toBe('A2');
    expect(rowTag(2, true)).toBe('A3');
  });

  it('blockIsSuperset lee el scheme REAL de los items, no solo el format', () => {
    const sup: Prescription = { scheme: 'superset', modality: 'strength' };
    // `format` desfasado (legacy/import a medias) — el scheme manda.
    const b = block([item(sup), item(sup)], 'strength_block');
    expect(blockIsSuperset(b)).toBe(true);
  });

  it('un bloque de series rectas no se marca como superserie', () => {
    const b = block([item(strengthSets(90)), item(strengthSets(90))]);
    expect(blockIsSuperset(b)).toBe(false);
  });
});
