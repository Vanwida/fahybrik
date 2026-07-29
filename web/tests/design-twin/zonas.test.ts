import { describe, expect, it } from 'vitest';
import { distribucionZonas, SIN_PULSO, type MedidoZonas } from '@/components/design-twin/zonas';

// El doble tiene que repartir las zonas EXACTAMENTE como la app
// (ios/FAHYBRIK/Workout/ZoneCoverage.swift). Si se separan, el espejo deja de
// serlo y volvemos a tener dos verdades — que es el fallo que este cálculo
// existe para cerrar.
//
// Las filas son las nueve `raw_lap_data_json.zone_seconds` de producción (toda
// la población), emparejadas con el `total_duration_seconds` de su ejecución.
// Son las MISMAS del test de Swift: los números esperados se comparan a mano
// entre los dos ficheros y no pueden divergir sin que uno de los dos falle.
const PRODUCCION: Array<{ id: string; medido: MedidoZonas }> = [
  { id: '90', medido: { duracionS: 16, zonasS: { z1: 9 } } },
  { id: '97', medido: { duracionS: 85, zonasS: { z1: 81 } } },
  { id: '162', medido: { duracionS: 572, zonasS: { z1: 236, z2: 246 } } },
  { id: '164', medido: { duracionS: 396, zonasS: { z1: 327, z2: 69 } } },
  { id: '170', medido: { duracionS: 19, zonasS: { z1: 19 } } },
  { id: '173', medido: { duracionS: 121, zonasS: { z1: 121 } } },
  { id: '175', medido: { duracionS: 361, zonasS: { z1: 42, z2: 85, z3: 195, z4: 38 } } },
  { id: '177', medido: { duracionS: 652, zonasS: { z2: 49, z3: 246, z4: 284 } } },
  { id: '179', medido: { duracionS: 392, zonasS: { z1: 18, z2: 111, z3: 95, z4: 117, z5: 51 } } },
];

describe('design-twin · distribucionZonas', () => {
  it('reparte la ejecución 162 sobre la sesión y declara el hueco', () => {
    // Sobre la SUMA pintaba 49/51 y daba por cubierto el entreno entero.
    const segmentos = distribucionZonas({ duracionS: 572, zonasS: { z1: 236, z2: 246 } });
    expect(segmentos.map((s) => s.etiqueta)).toEqual(['Z1 41%', 'Z2 43%', `${SIN_PULSO} 16%`]);
  });

  it('lo listado suma 100 en las nueve filas de producción', () => {
    for (const { id, medido } of PRODUCCION) {
      const segmentos = distribucionZonas(medido);
      expect(segmentos.length, `ejecución ${id}`).toBeGreaterThan(0);
      expect(segmentos.reduce((acc, s) => acc + s.pct, 0), `ejecución ${id}`).toBe(100);
    }
  });

  it('no declara hueco donde la banda cubrió toda la sesión', () => {
    for (const id of ['164', '170', '173', '179']) {
      const { medido } = PRODUCCION.find((f) => f.id === id)!;
      expect(distribucionZonas(medido).some((s) => s.zona === null), `ejecución ${id}`).toBe(false);
    }
  });

  it('el hueco va al final y solo lo lleva quien lo tiene', () => {
    // 90 es el peor caso real: 9 s medidos de 16.
    const segmentos = distribucionZonas({ duracionS: 16, zonasS: { z1: 9 } });
    expect(segmentos.at(-1)).toEqual({ zona: null, pct: 44, etiqueta: `${SIN_PULSO} 44%` });
  });

  it('una zona sin tiempo no se pinta a cero', () => {
    const segmentos = distribucionZonas({ duracionS: 572, zonasS: { z1: 236, z2: 246, z5: 0 } });
    expect(segmentos.map((s) => s.zona)).toEqual([1, 2, null]);
  });

  it('sin zonas no hay barra que pintar', () => {
    expect(distribucionZonas({ duracionS: 600, zonasS: {} })).toEqual([]);
    expect(distribucionZonas({ duracionS: 600, zonasS: { z1: 0, z2: 0 } })).toEqual([]);
  });

  it('un reloj más corto que lo medido es redondeo, no un hueco negativo', () => {
    const segmentos = distribucionZonas({ duracionS: 120, zonasS: { z1: 121 } });
    expect(segmentos).toEqual([{ zona: 1, pct: 100, etiqueta: 'Z1 100%' }]);
  });
});
