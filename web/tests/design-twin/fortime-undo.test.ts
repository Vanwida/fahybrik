import { describe, expect, it } from 'vitest';
import { holdOpenLastSceneStation } from '@fahybrid/shared/domain/live-undo';
import { SCORE_APERTURA_S, rutaEn } from '@/components/design-twin/screens/vivo-fortime/data';

describe('For Time · deshacer la última estación de la escena', () => {
  it('reabre esa estación y el resto de la ruta se queda', () => {
    const score = SCORE_APERTURA_S + 5;
    const cerrada = rutaEn(score, { 9: 1 });
    expect(cerrada.ultimaDeLaEscena).toBe(9);
    expect(cerrada.activo).toBeGreaterThan(9);

    const held = holdOpenLastSceneStation(cerrada.ultimaDeLaEscena, []);
    const viva = rutaEn(score, {}, held);
    expect(viva.activo).toBe(9);
    expect(viva.cerradas[9]).toBeNull();
    expect(viva.cerradas[0]).not.toBeNull();
  });
});
