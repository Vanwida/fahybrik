import { describe, expect, it } from 'vitest';
import {
  projectRecap,
  recapIsEmpty,
  workSecondsFromRaw,
  type RecapSegmentInput,
} from '@fahybrid/shared/domain/recap';

const run = (over: Partial<RecapSegmentInput> = {}): RecapSegmentInput => ({
  position: 0,
  modality: 'run',
  ...over,
});

describe('projectRecap', () => {
  it('sin ejecución no hay recap que enseñar', () => {
    expect(recapIsEmpty(projectRecap({ segments: [] }))).toBe(true);
    expect(
      recapIsEmpty(
        projectRecap({
          segments: [run({ duration_seconds: null, distance_meters: null })],
        }),
      ),
    ).toBe(true);
  });

  it('el ritmo y el tiempo son los corridos, no el 5:45 pedido', () => {
    const recap = projectRecap({
      segments: [
        run({
          item_uid: 'segment-1',
          distance_meters: 1000,
          avg_pace_s_per_km: 219,
          duration_seconds: 345,
          started_at: '2026-08-25T08:00:00Z',
          ended_at: '2026-08-25T08:05:45Z',
          prescribed_pace_s_per_km: 345,
        }),
      ],
      labelsByItemUid: { 'segment-1': 'Correr' },
    });

    expect(recap.blocks).toHaveLength(1);
    const block = recap.blocks[0]!;
    expect(block.kind).toBe('run');
    expect(block.distance_m).toBe(1000);
    expect(block.pace_s_per_km).toBe(219);
    expect(block.duration_s).toBe(219);
    expect(block.pace_s_per_km).not.toBe(345);
    expect(block.duration_s).not.toBe(345);
  });

  it('las series salen de set_executions, no de la receta', () => {
    const recap = projectRecap({
      segments: [
        {
          position: 1,
          modality: 'strength',
          item_uid: 'segment-2',
          reps_completed: 25,
          weight_used_kg: 100,
          sets: [
            { set_index: 1, reps_actual: 5, load_actual_kg: 80, is_approach: true },
            { set_index: 2, reps_actual: 5, load_actual_kg: 100 },
            { set_index: 3, reps_actual: 5, load_actual_kg: 100 },
            { set_index: 4, reps_actual: 5, load_actual_kg: 100 },
          ],
        },
      ],
      labelsByItemUid: { 'segment-2': 'Peso muerto' },
    });

    expect(recap.blocks[0]).toMatchObject({
      label: 'Peso muerto',
      kind: 'strength',
      sets: [
        { set_index: 1, reps: 5, load_kg: 80, is_approach: true },
        { set_index: 2, reps: 5, load_kg: 100, is_approach: false },
        { set_index: 3, reps: 5, load_kg: 100, is_approach: false },
        { set_index: 4, reps: 5, load_kg: 100, is_approach: false },
      ],
    });
  });

  it('las estaciones se leen en orden, con su ronda', () => {
    const recap = projectRecap({
      segments: [
        run({
          position: 0,
          distance_meters: 1000,
          avg_pace_s_per_km: 219,
          duration_seconds: 219,
          round_index: 1,
          item_uid: 'segment-run',
        }),
        {
          position: 1,
          modality: 'other',
          item_uid: 'segment-ski',
          distance_meters: 500,
          duration_seconds: 110,
          avg_pace_s_per_500m: 110,
          round_index: 1,
        },
        run({
          position: 2,
          distance_meters: 1000,
          avg_pace_s_per_km: 225,
          duration_seconds: 225,
          round_index: 2,
          item_uid: 'segment-run',
        }),
      ],
      labelsByItemUid: {
        'segment-run': 'Correr',
        'segment-ski': 'SkiErg',
      },
    });

    expect(recap.blocks.map((b) => [b.label, b.kind, b.round, b.duration_s])).toEqual([
      ['Correr', 'run', 1, 219],
      ['SkiErg', 'station', 1, 110],
      ['Correr', 'run', 2, 225],
    ]);
  });

  it('un work_s en el json manda sobre la ventana de pared', () => {
    expect(workSecondsFromRaw({ zone_seconds: { z2: 10 }, work_s: 219 })).toBe(219);
    expect(workSecondsFromRaw({ work_s: '219' })).toBeNull();
    expect(workSecondsFromRaw(null)).toBeNull();

    const recap = projectRecap({
      segments: [
        run({
          work_s: 219,
          duration_seconds: 345,
          started_at: '2026-08-25T08:00:00Z',
          ended_at: '2026-08-25T08:05:45Z',
          distance_meters: 1000,
        }),
      ],
    });
    expect(recap.blocks[0]?.duration_s).toBe(219);
    expect(recap.blocks[0]?.pace_s_per_km).toBe(219);
  });
});
