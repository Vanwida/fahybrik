/**
 * serializeSessionSegments / serializeBlockExercises — la estructura es ADITIVA
 * al plano (contrato del wire, ios Prescription.swift: «a block that carries
 * `structure` ALSO carries the flat»).
 *
 * Caso real (10-ago-2026): el conector MCP guardó un fartlek con `structure`
 * SOLA (16×500m Z3 / 1' Z2) y todas las superficies de resumen quedaron mudas:
 * `params_json` = {}, dosis invisible en la tarjeta del día y en la previa de
 * la sesión — el atleta solo veía el título. El serializador debe derivar el
 * plano con `structureToLegacy` cuando falte, y no tocar nada cuando ya esté.
 */
import { describe, expect, test } from 'vitest';
import {
  serializeSessionSegments,
  serializeBlockExercises,
} from '@/lib/dashboard/v2/editor-serialize';
import { prescriptionSchema } from '@fahybrid/shared/domain/prescription/types';
import { prescriptionToText } from '@fahybrid/shared/domain/prescription/to-text';

const FARTLEK_STRUCTURE_ONLY = prescriptionSchema.parse({
  scheme: 'intervals',
  modality: 'run',
  structure: [
    {
      role: 'main',
      elements: [
        {
          times: 16,
          elements: [
            { kind: 'work', measure: { type: 'distance', m: 500 }, target: { type: 'pace_zone', zone: 3 } },
            {
              kind: 'recovery',
              measure: { type: 'duration', s: 60 },
              target: { type: 'pace_zone', zone: 2 },
              recovery_mode: 'trote',
            },
          ],
        },
      ],
    },
  ],
});

function blocks(prescription: unknown) {
  return [
    {
      title: 'Fartlek',
      format: 'intervals',
      items: [{ exercise_id: 1, exercise_name: 'Run', prescription: prescription as never }],
    },
  ] as never;
}

describe('estructura sola → el serializador deriva el plano', () => {
  test('serializeSessionSegments rellena params_json y el plano de prescription_json', () => {
    const [seg] = serializeSessionSegments(blocks(FARTLEK_STRUCTURE_ONLY));

    // params_json deja de ser {}: los lectores escalares ven la dosis
    expect(seg.params_json).toMatchObject({ rest_seconds: 60, distance_meters: 500 });

    // el prescription_json guarda estructura Y plano (contrato aditivo)
    const stored = seg.prescription_json as unknown as Record<string, unknown>;
    expect(stored.structure).toBeDefined();
    expect(stored.rounds).toBe(16);
    expect(Array.isArray(stored.sets)).toBe(true);

    // y el texto de dosis que usan tarjetas y read-backs deja de estar mudo
    const text = prescriptionToText(prescriptionSchema.parse(stored));
    expect(text).toContain('16');
    expect(text).toContain('500');
  });

  test('serializeBlockExercises guarda el mismo prescription enriquecido', () => {
    const [row] = serializeBlockExercises(blocks(FARTLEK_STRUCTURE_ONLY));
    const stored = row.prescription_json as unknown as Record<string, unknown>;
    expect(stored.structure).toBeDefined();
    expect(stored.rounds).toBe(16);
  });

  test('con el plano ya presente, no se toca nada', () => {
    const withFlat = prescriptionSchema.parse({
      scheme: 'intervals',
      modality: 'run',
      rounds: 12,
      sets: [{ measure: { kind: 'distance', meters: 400 }, rest_s: 90 }],
      structure: FARTLEK_STRUCTURE_ONLY.structure,
    });
    const [seg] = serializeSessionSegments(blocks(withFlat));
    const stored = seg.prescription_json as unknown as Record<string, unknown>;
    // el plano declarado por el autor manda; el flatten no lo pisa
    expect(stored.rounds).toBe(12);
    expect((stored.sets as unknown[]).length).toBe(1);
  });

  test('sin estructura, comportamiento idéntico al de siempre', () => {
    const plain = prescriptionSchema.parse({
      scheme: 'sets',
      modality: 'strength',
      sets: [{ measure: { kind: 'reps', value: 5 }, target: { kind: 'rir', value: 2 } }],
    });
    const [seg] = serializeSessionSegments(blocks(plain));
    const stored = seg.prescription_json as unknown as Record<string, unknown>;
    expect(stored.structure).toBeUndefined();
    expect((stored.sets as unknown[]).length).toBe(1);
  });
});
