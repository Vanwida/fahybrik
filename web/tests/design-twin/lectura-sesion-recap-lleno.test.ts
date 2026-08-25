import { describe, expect, it } from 'vitest';
import {
  projectSeriesSticker,
  stickerSplitNumbers,
  STICKER_ALTO_MAX,
  STICKER_ANCHO,
} from '@fahybrid/shared/domain/recap-sticker';
import { ESCENAS } from '@/components/design-twin/screens/lectura-sesion/datos';
import { piezasDeDesglose, recapDesdeBloques } from '@/components/design-twin/screens/lectura-sesion/modelo';
import { STORY } from '@/components/design-twin/screens/pegatina-series/lienzo';
import { meta as pegatinaMeta } from '@/components/design-twin/screens/pegatina-series';

describe('lectura-sesion · recap lleno → pegatina', () => {
  it('los parciales de la pegatina son los del recap-lleno', () => {
    const sesion = ESCENAS['recap-lleno']!;
    const recap = recapDesdeBloques(sesion.bloques);
    const sticker = projectSeriesSticker(recap);
    expect(sticker).not.toBeNull();
    expect(sticker!.label).toBe('VO2max');
    expect(sticker!.pauta).toBe('400 m');
    expect(sticker!.splits).toHaveLength(8);

    const runs = sesion.bloques.filter(
      (b): b is Extract<typeof b, { modalidad: 'correr' }> =>
        b.modalidad === 'correr' && b.distanciaM === 400,
    );
    expect(stickerSplitNumbers(sticker!)).toEqual(
      runs.map((b) => ({
        duration_s: b.duracionS,
        pace_s_per_km: b.duracionS != null && b.distanciaM ? b.duracionS / (b.distanciaM / 1000) : null,
      })),
    );

    const layout = piezasDeDesglose(sesion.bloques);
    expect(layout.map((p) => (p.form === 'series' ? p.series.label : p.block.label))).toEqual([
      'VO2max',
      'Sled push',
      'Lunges',
    ]);
  });

  it('el simulacro no se recorta como tanda de series', () => {
    const sesion = ESCENAS['simulacro-hyrox']!;
    expect(projectSeriesSticker(recapDesdeBloques(sesion.bloques))).toBeNull();
  });

  it('la pegatina del gemelo recorta el mismo recap y cabe en una esquina', () => {
    expect(STORY.tarjetaAncho).toBe(STICKER_ANCHO);
    expect(STORY.tarjetaAltoMax).toBe(STICKER_ALTO_MAX);
    expect(STORY.tarjetaAncho / STORY.ancho).toBeLessThan(0.7);
    expect(STORY.tarjetaAltoMax / STORY.alto).toBeLessThan(0.4);
    expect(pegatinaMeta.id).toBe('pegatina-series');
  });
});
