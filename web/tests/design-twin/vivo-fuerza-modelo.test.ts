import { describe, expect, it } from 'vitest';
import { APOYOS_PT } from '@/components/design-twin/kit-vivo';
import {
  CABEN_CON_DOSIS,
  CASOS,
  DIP_12,
  SQUAT_4X10,
  SQUAT_PIRAMIDE,
  UMBRAL_VENTANA,
  cargaTexto,
  cascada,
  cerradasHasta,
  cifraDeSerie,
  hechaEnLinea,
  peldanosVisibles,
  serieEnLinea,
} from '@/components/design-twin/screens/vivo-fuerza/modelo';

// Las decisiones del hierro que, si alguien las deshace en una pantalla, hacen
// que la app MIENTA sobre lo que el coach escribió. No se sostienen con un
// comentario: se sostienen aquí, y sobre los casos REALES de la base.
//
// El precedente es `plan-modelo.test.ts` y, antes, `zonas.test.ts`: el reparto de
// zonas se separó de la app y hubo dos verdades. Aquí se corta antes.

describe('la carga tiene tres formas y ninguna se disfraza de otra', () => {
  it('un porcentaje JAMÁS se escribe como kilos', () => {
    // Es el fallo que se lleva a un atleta a poner 75 kg donde el coach pidió el
    // 75 % de su máximo. La banda se dice entera, no solo el suelo.
    const cifra = cifraDeSerie(SQUAT_PIRAMIDE.series[0]);
    expect(cifra).not.toBeNull();
    expect(cifra!.cifra).toBe('6');
    expect(cifra!.unidad).toBe('reps');
    expect(cifra!.segundo).toEqual({ cifra: '75-85', unidad: '% de tu máximo' });
    expect(serieEnLinea(SQUAT_PIRAMIDE.series[0])).not.toContain('kg');
  });

  it('los kilos van en la cifra, con la coma decimal del atleta', () => {
    const cifra = cifraDeSerie(SQUAT_4X10.series[0]);
    expect(cifra!.cifra).toBe('10 × 82,5');
    expect(cifra!.unidad).toBe('kg');
    // «10 × 82,5» es UNA cosa: no se parte en dos peldaños, que invertiría la
    // jerarquía (en fuerza se leen las repeticiones y luego la carga).
    expect(cifra!.segundo).toBeNull();
  });

  it('un porcentaje sin techo no se escribe como si abriera banda', () => {
    expect(cargaTexto({ tipo: 'porcentaje', min: 70, max: null })).toBe('70 %');
    expect(cargaTexto({ tipo: 'porcentaje', min: 70, max: 70 })).toBe('70 %');
    expect(cargaTexto({ tipo: 'porcentaje', min: 65, max: 80 })).toBe('65-80 %');
  });

  it('sin medida y sin carga no hay cifra que inventar', () => {
    expect(cifraDeSerie({ medida: null, carga: null, descansoS: null })).toBeNull();
    // Y con carga pero sin medida —el circuito real del coach— la carga es la cifra.
    expect(cifraDeSerie({ medida: null, carga: { tipo: 'kg', kg: 30 }, descansoS: null })).toEqual({
      cifra: '30',
      unidad: 'kg',
      segundo: null,
    });
  });

  it('una banda de repeticiones se enseña entera', () => {
    expect(serieEnLinea({ medida: { reps: 12, hasta: 15 }, carga: { tipo: 'kg', kg: 60 }, descansoS: null })).toBe(
      '12-15 × 60 kg'
    );
  });
});

describe('las series de la base no son iguales entre sí', () => {
  it('la pirámide del bloque 392 conserva su medida serie a serie', () => {
    expect(SQUAT_PIRAMIDE.series.map((s) => s.medida?.reps)).toEqual([6, 6, 4, 4, 3]);
  });

  it('la última serie no lleva descanso: no se descansa después de la última', () => {
    for (const ej of [SQUAT_4X10, SQUAT_PIRAMIDE]) {
      expect(ej.series[ej.series.length - 1].descansoS).toBeNull();
      expect(ej.series[0].descansoS).not.toBeNull();
    }
  });

  it('el ejercicio más largo del corpus tiene doce series', () => {
    expect(DIP_12.series).toHaveLength(12);
    expect(DIP_12.series.map((s) => s.medida?.reps)).toEqual([10, 10, 8, 8, 6, 4, 12, 10, 10, 8, 8, 6]);
  });
});

describe('el riel: el umbral se deriva del ancho, no se elige', () => {
  it('caben cuatro peldaños con dosis, y la ventana empieza en la quinta', () => {
    expect(CABEN_CON_DOSIS).toBe(4);
    expect(UMBRAL_VENTANA).toBe(5);
  });

  it('con cuatro series se enseñan las cuatro', () => {
    expect(peldanosVisibles(4, 1)).toEqual([0, 1, 2, 3]);
  });

  it('desde la quinta es una ventana de tres pegada al cursor', () => {
    expect(peldanosVisibles(5, 2)).toEqual([1, 2, 3]);
    expect(peldanosVisibles(12, 6)).toEqual([5, 6, 7]);
  });

  it('en los extremos la ventana se DESPLAZA en vez de encogerse', () => {
    // La primera y la última serie tendrían dos peldaños en vez de tres, y el
    // riel dejaría de medir lo mismo en toda la serie del ejercicio.
    expect(peldanosVisibles(12, 0)).toEqual([0, 1, 2]);
    expect(peldanosVisibles(12, 11)).toEqual([9, 10, 11]);
  });
});

describe('la cascada de apoyos cabe en los 213 pt del marco', () => {
  it('el hueco de apoyos lo deriva el kit del reparto de la banda', () => {
    expect(APOYOS_PT).toBe(213);
  });

  it('con discos que poner, lo que se cae es «lo siguiente»', () => {
    expect(cascada({ ventana: false, barra: true, siguiente: true })).toEqual({
      riel: true,
      fila: true,
      barra: true,
      siguiente: false,
    });
  });

  it('sin barra, lo siguiente entra', () => {
    expect(cascada({ ventana: false, barra: false, siguiente: true })).toEqual({
      riel: true,
      fila: true,
      barra: false,
      siguiente: true,
    });
  });

  it('el riel y la fila entran SIEMPRE, incluso con la cabecera de la ventana', () => {
    const c = cascada({ ventana: true, barra: true, siguiente: true });
    expect(c.riel).toBe(true);
    expect(c.fila).toBe(true);
  });
});

describe('lo hecho es lo que el atleta declaró, no lo que se pidió', () => {
  it('cerrar de un toque archiva lo prescrito y deja el RIR sentido vacío', () => {
    const hechas = cerradasHasta(SQUAT_4X10, 2);
    expect(Object.keys(hechas)).toEqual(['0', '1']);
    expect(hechas[0]).toEqual({
      reps: 10,
      carga: { tipo: 'kg', kg: 82.5 },
      rirSentido: null,
      estado: 'hecha',
    });
  });

  it('una serie ajustada enseña su dosis real, no la del plan', () => {
    const hechas = cerradasHasta(SQUAT_4X10, 3, {
      2: { carga: { tipo: 'kg', kg: 77.5 }, estado: 'ajustada' },
    });
    expect(hechaEnLinea(hechas[2])).toBe('10 × 77,5 kg');
    expect(hechas[2].estado).toBe('ajustada');
  });

  it('una serie saltada se dice, no se cuenta como un cero', () => {
    expect(hechaEnLinea({ reps: null, carga: null, rirSentido: null, estado: 'saltada' })).toBe('saltada');
  });
});

describe('los escenarios de la pantalla apuntan a casos reales', () => {
  it('los tres casos declaran su procedencia en la base', () => {
    for (const caso of Object.values(CASOS)) {
      expect(caso.procedencia).toMatch(/plantilla|bloque/);
      expect(caso.series.length).toBeGreaterThan(0);
    }
  });
});
