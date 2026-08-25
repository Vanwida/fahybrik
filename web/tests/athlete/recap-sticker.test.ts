import { describe, expect, it } from 'vitest';
import { projectRecap, type RecapSegmentInput } from '@fahybrid/shared/domain/recap';
import {
  projectRecapLayout,
  projectSeriesSticker,
  stickerSplitNumbers,
  STICKER_ALTO_MAX,
  STICKER_ANCHO,
  STICKER_COLUMNS_FROM,
} from '@fahybrid/shared/domain/recap-sticker';

const VO2MAX_LAPS: Array<{ duration_s: number; pace_s_per_km: number }> = [
  { duration_s: 88, pace_s_per_km: 220 },
  { duration_s: 87, pace_s_per_km: 217 },
  { duration_s: 87, pace_s_per_km: 217 },
  { duration_s: 86, pace_s_per_km: 215 },
  { duration_s: 86, pace_s_per_km: 215 },
  { duration_s: 85, pace_s_per_km: 212 },
  { duration_s: 85, pace_s_per_km: 212 },
  { duration_s: 82, pace_s_per_km: 205 },
];

function vo2maxSegments(): RecapSegmentInput[] {
  return VO2MAX_LAPS.map((lap, i) => ({
    position: i,
    modality: 'run',
    item_uid: 'vo2max',
    distance_meters: 400,
    duration_seconds: lap.duration_s,
    avg_pace_s_per_km: lap.pace_s_per_km,
    prescribed_pace_s_per_km: 240,
  }));
}

function recapLleno() {
  return projectRecap({
    segments: [
      ...vo2maxSegments(),
      {
        position: 8,
        modality: 'other',
        item_uid: 'sled',
        distance_meters: 50,
        duration_seconds: 42,
        reps_completed: null,
      },
      {
        position: 9,
        modality: 'other',
        item_uid: 'lunges',
        distance_meters: 100,
        duration_seconds: 95,
      },
    ],
    labelsByItemUid: {
      vo2max: 'VO2max',
      sled: 'Sled push',
      lunges: 'Lunges',
    },
  });
}

describe('projectSeriesSticker · recorte del recap', () => {
  it('los parciales de la pegatina son los del recap, no el ritmo pedido', () => {
    const recap = recapLleno();
    const sticker = projectSeriesSticker(recap);
    expect(sticker).not.toBeNull();
    expect(sticker!.label).toBe('VO2max');
    expect(sticker!.pauta).toBe('400 m');
    expect(sticker!.columns).toBe(2);
    expect(sticker!.splits).toHaveLength(8);

    const runBlocks = recap.blocks.filter((b) => b.kind === 'run');
    expect(stickerSplitNumbers(sticker!)).toEqual(
      runBlocks.map((b) => ({
        duration_s: b.duration_s,
        pace_s_per_km: b.pace_s_per_km,
      })),
    );
    expect(sticker!.splits.every((s) => s.pace_s_per_km !== 240)).toBe(true);
    expect(sticker!.splits.at(-1)?.is_best).toBe(true);
    expect(sticker!.splits.filter((s) => s.is_best)).toHaveLength(1);
  });

  it('sled y lunges quedan en el recap y fuera de la pegatina', () => {
    const recap = recapLleno();
    const layout = projectRecapLayout(recap);
    expect(layout.map((p) => (p.form === 'series' ? p.series.label : p.block.label))).toEqual([
      'VO2max',
      'Sled push',
      'Lunges',
    ]);
    expect(projectSeriesSticker(recap)?.splits).toHaveLength(8);
    expect(recap.blocks.some((b) => b.label === 'Sled push')).toBe(true);
    expect(recap.blocks.some((b) => b.label === 'Lunges')).toBe(true);
  });

  it('sin tanda no hay pegatina que inventar', () => {
    const recap = projectRecap({
      segments: [
        {
          position: 0,
          modality: 'run',
          distance_meters: 1000,
          duration_seconds: 219,
          avg_pace_s_per_km: 219,
        },
        {
          position: 1,
          modality: 'other',
          item_uid: 'sled',
          distance_meters: 50,
          duration_seconds: 42,
        },
      ],
      labelsByItemUid: { sled: 'Sled push' },
    });
    expect(projectSeriesSticker(recap)).toBeNull();
    expect(projectRecapLayout(recap).every((p) => p.form === 'block')).toBe(true);
  });

  it('un simulacro con 1 km entre estaciones no se lee como una tanda', () => {
    const recap = projectRecap({
      segments: [1, 2, 3].flatMap((round) => [
        {
          position: round * 2,
          modality: 'run',
          item_uid: 'run',
          distance_meters: 1000,
          duration_seconds: 255 + round * 5,
          avg_pace_s_per_km: 255 + round * 5,
          round_index: round,
        },
        {
          position: round * 2 + 1,
          modality: 'other',
          item_uid: `st-${round}`,
          distance_meters: 50,
          duration_seconds: 40,
          round_index: round,
        },
      ]),
      labelsByItemUid: { run: 'Correr', 'st-1': 'Ski', 'st-2': 'Sled', 'st-3': 'Lunges' },
    });
    expect(projectSeriesSticker(recap)).toBeNull();
  });

  it('la pegatina cabe en una esquina, no a pantalla completa', () => {
    expect(STICKER_ANCHO).toBe(700);
    expect(STICKER_ALTO_MAX).toBe(700);
    expect(STICKER_ANCHO / 1080).toBeLessThan(0.7);
    expect(STICKER_ALTO_MAX / 1920).toBeLessThan(0.4);
    expect(STICKER_COLUMNS_FROM).toBe(6);
  });
});
