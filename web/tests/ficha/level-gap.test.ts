// El porqué de «sin sugerencia de nivel» en la ficha, con su siguiente paso.

import { describe, expect, it } from 'vitest';
import { levelSuggestionGapLine } from '@/lib/dashboard/v2/level-gap';

describe('levelSuggestionGapLine', () => {
  it('con sugerencia no hay línea', () => {
    expect(
      levelSuggestionGapLine(
        { status: 'suggested', level_id: '1', level_name: 'N1', position: 1, confidence: 'low', signals: ['run_5k_s'] },
        'Nivel',
      ),
    ).toBeNull();
  });

  it('cada motivo lleva a donde se arregla, con el nombre del eje del coach', () => {
    expect(levelSuggestionGapLine({ status: 'no_levels' }, 'Turno')).toEqual({
      reason: 'no_levels',
      text: 'No hay turno que sugerir: todavía no has creado ninguno.',
      action: { label: 'Crearlos en Ajustes › Método', href: '/ajustes/metodo#niveles' },
    });
    expect(levelSuggestionGapLine({ status: 'no_criteria' }, 'Nivel')?.action).toEqual({
      label: 'Define qué marca abre cada uno',
      href: '/ajustes/metodo#niveles',
    });
    expect(levelSuggestionGapLine({ status: 'no_signals' }, 'Nivel')).toMatchObject({
      text: 'Sin sugerencia: el atleta no tiene marcas que tus cortes lean.',
      action: { label: 'Ponle un test', href: '/programar/tests' },
    });
  });
});
