import { describe, expect, it } from 'vitest';
import { AVISO_RELEVO, esRelevo, formatoDobles, heroeRelevo, pactoDe, textoTurno, type Dobles } from '@/components/design-twin/kit-reloj/dobles';
import { primariaDe } from '@/components/design-twin/kit-iphone-vivo/accion';

// Espejo de `ios/FAHYBRIKTests/Vivo/VivoDoblesTests.swift`: mismos insumos, mismas salidas.

const relevo: Dobles = { turno: 'pareja', pareja: 'Marta', estacion: 'SkiErg 1km', pctTuyo: 0 };
const reparto: Dobles = { turno: 'reparto', pareja: 'Marta', estacion: 'Wall Balls', tuyas: 60, suyas: 40, pctTuyo: 60, nota: 'alterna 25' };

describe('los dobles en el vivo', () => {
  it('la estación de la pareja es un relevo: se espera y se declara', () => {
    expect(esRelevo({ dobles: relevo })).toBe(true);
    expect(esRelevo({ dobles: reparto })).toBe(false);
    expect(esRelevo({})).toBe(false);
    expect(formatoDobles(relevo)).toBe('Dobles · le toca a Marta');
    expect(heroeRelevo(42)).toEqual({ clase: 'crono', texto: '0:42', etiqueta: 'recuperas' });
    expect(AVISO_RELEVO).toBe('Relevo · entras tú');
    expect(primariaDe('relevo')).toEqual({ texto: 'Relevo', peso: 'primaria' });
  });

  it('el reparto dice el pacto; sin nombre, «tu pareja»', () => {
    expect(pactoDe(reparto)).toBe('Tú 60 · Marta 40 · alterna 25');
    expect(formatoDobles(reparto)).toBe('Dobles · con Marta');
    expect(pactoDe(relevo)).toBeNull();
    const sinNombre: Dobles = { ...reparto, pareja: undefined };
    expect(pactoDe(sinNombre)).toBe('Tú 60 · Tu pareja 40 · alterna 25');
    expect(textoTurno({ ...relevo, pareja: undefined })).toBe('le toca a tu pareja');
    expect(pactoDe({ ...reparto, tuyas: undefined, suyas: undefined, nota: undefined })).toBe('Tú 60 % · Marta 40 %');
    expect(textoTurno({ turno: 'tuyo', estacion: 'Sled Push', pctTuyo: 100 })).toBe('te toca');
  });
});
