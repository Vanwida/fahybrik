import { describe, expect, it } from 'vitest';
import { trazaPulsoIlustrativa } from '@/components/design-twin/screens/lectura-sesion/senal';
import type { Bloque } from '@/components/design-twin/screens/lectura-sesion/modelo';

// La traza es RECONSTRUIDA (card 124: «genera una serie plausible que respete
// media 115, máxima 149 y mínimo 65»), nunca medida. Este test comprueba lo
// que el escenario ① necesita que sea cierto: exactamente 620 muestras, y una
// forma que se queda en el barrio de la media/máxima/mínimo reales — no un
// ajuste exacto al ppm, que sería fingir una precisión que no existe.

const BLOQUES_FUERZA_TRINEOS: Bloque[] = [
  { modalidad: 'correr', etiqueta: 'Calentamiento', duracionS: 360, distanciaM: null, fcMediaPpm: null },
  { modalidad: 'correr', etiqueta: 'Rodaje', duracionS: 357, distanciaM: null, fcMediaPpm: 139 },
  { modalidad: 'fuerza', etiqueta: 'Peso muerto', duracionS: 669, grupos: null, fcMediaPpm: 128 },
  { modalidad: 'fuerza', etiqueta: 'Peso muerto rumano', duracionS: 426, grupos: null, fcMediaPpm: 113 },
  { modalidad: 'fuerza', etiqueta: 'Remo con barra', duracionS: null, grupos: null, fcMediaPpm: 112 },
  { modalidad: 'fuerza', etiqueta: 'Fuerza', duracionS: null, grupos: null, fcMediaPpm: 115 },
  { modalidad: 'funcional', etiqueta: 'Trineos', duracionS: 260, reps: null, metros: null, fcMediaPpm: 121 },
  { modalidad: 'funcional', etiqueta: 'Trineos', duracionS: null, reps: null, metros: null, fcMediaPpm: 107 },
];

describe('lectura-sesion · trazaPulsoIlustrativa', () => {
  it('declara exactamente el número de muestras pedido', () => {
    const traza = trazaPulsoIlustrativa(BLOQUES_FUERZA_TRINEOS, 2822, 620);
    expect(traza).toHaveLength(620);
    expect(traza[0]?.t).toBe(0);
    expect(traza[traza.length - 1]?.t).toBeCloseTo(2822, 0);
  });

  it('la media, la máxima y el mínimo quedan en el barrio de los reales (115 / 149 / 65)', () => {
    const traza = trazaPulsoIlustrativa(BLOQUES_FUERZA_TRINEOS, 2822, 620);
    const valores = traza.map((m) => m.v);
    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    expect(media).toBeGreaterThan(108);
    expect(media).toBeLessThan(122);
    expect(Math.max(...valores)).toBeGreaterThan(140);
    expect(Math.min(...valores)).toBeLessThan(72);
  });

  it('sin bloques, no hay traza que dibujar', () => {
    expect(trazaPulsoIlustrativa([], 1000, 100)).toEqual([]);
  });
});
