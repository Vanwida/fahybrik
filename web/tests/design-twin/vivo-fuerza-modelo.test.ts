import { describe, expect, it } from 'vitest';
import { TANDA_TODAS_HASTA, TANDA_VENTANA } from '@fahybrid/shared/domain/tanda-strip';
import { APOYOS_PT } from '@/components/design-twin/kit-vivo';
import {
  CABEN_CON_DOSIS,
  CASOS,
  DIP_12,
  ETIQUETA_BANDA,
  SQUAT_4X10,
  SQUAT_PIRAMIDE,
  TONO_BANDA,
  UMBRAL_VENTANA,
  VELOCIDAD_DUDOSA,
  VELOCIDAD_SQUAT,
  VENTANA,
  bandaDe,
  cargaTexto,
  cascada,
  cerradasHasta,
  cifraDeSerie,
  hechaEnLinea,
  msTexto,
  etiquetaTanda,
  peldanosVisibles,
  perdidaPct,
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
    expect(CABEN_CON_DOSIS).toBe(TANDA_TODAS_HASTA);
    expect(VENTANA).toBe(TANDA_VENTANA);
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

  it('la etiqueta de la tanda se lee 1 / 2 / 3, no solo la que toca', () => {
    const hechas = cerradasHasta(SQUAT_4X10, 1);
    expect(etiquetaTanda(4, 1, hechas)).toBe('1 / 2 / 3 / 4');
    expect(etiquetaTanda(12, 6, cerradasHasta(DIP_12, 6))).toBe('6 / 7 / 8');
    expect(
      etiquetaTanda(4, 1, {
        0: { reps: 10, carga: { tipo: 'kg', kg: 82.5 }, rirSentido: null, estado: 'saltada', velocidad: null },
      }),
    ).toBe('1 / 2 / 3 / 4');
  });
});

describe('la cascada de apoyos cabe en los 213 pt del marco', () => {
  it('el hueco de apoyos lo deriva el kit del reparto de la banda', () => {
    expect(APOYOS_PT).toBe(213);
  });

  it('con discos que poner, lo que se cae es «lo siguiente»', () => {
    expect(cascada({ ventana: false, lectura: false, barra: true, siguiente: true })).toEqual({
      riel: true,
      fila: true,
      lectura: false,
      barra: true,
      siguiente: false,
    });
  });

  it('sin barra, lo siguiente entra', () => {
    expect(cascada({ ventana: false, lectura: false, barra: false, siguiente: true })).toEqual({
      riel: true,
      fila: true,
      lectura: false,
      barra: false,
      siguiente: true,
    });
  });

  it('el riel y la fila entran SIEMPRE, incluso con la cabecera de la ventana', () => {
    const c = cascada({ ventana: true, lectura: true, barra: true, siguiente: true });
    expect(c.riel).toBe(true);
    expect(c.fila).toBe(true);
  });

  it('la lectura de la velocidad entra antes que «lo siguiente»', () => {
    // Con la ventana (que paga su cabecera) y la frase de la pérdida ya van 178 de
    // los 213 pt, así que el chip de lo que viene se cae. Y así tiene que ser: la
    // pérdida habla de la serie que acabas de hacer y el ejercicio siguiente puede
    // esperar a que sueltes la barra.
    expect(cascada({ ventana: true, lectura: true, barra: false, siguiente: true })).toEqual({
      riel: true,
      fila: true,
      lectura: true,
      barra: false,
      siguiente: false,
    });
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
      // Sin sensor no hay lectura, y eso es NULO explícito: la serie se cerró y
      // de la velocidad no se sabe nada.
      velocidad: null,
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

describe('la velocidad de la barra: lo único que la app mide del levantamiento', () => {
  it('la banda la resuelve el dominio compartido, no la pantalla', () => {
    // Si alguien cambia los cortes del coach en `shared/domain/strength`, el doble
    // se mueve con la app. Estos tres caen en las tres bandas de los defectos
    // (0,55 · 0,40 · 0,25 m/s) sin que aquí haya escrito ningún umbral.
    expect(bandaDe({ msPrimera: 0.7, msUltima: 0.61, confianza: 0.8 })).toBe('green');
    expect(bandaDe({ msPrimera: 0.62, msUltima: 0.49, confianza: 0.78 })).toBe('yellow');
    expect(bandaDe({ msPrimera: 0.55, msUltima: 0.38, confianza: 0.74 })).toBe('orange');
    expect(bandaDe({ msPrimera: 0.4, msUltima: 0.18, confianza: 0.7 })).toBe('red');
  });

  it('sin confianza no se pinta un rojo con aplomo', () => {
    // La medida del fondo lastrado del corpus: 0,34 m/s caería en «lenta», pero la
    // confianza es 0,31 y por debajo del corte la app no afirma nada.
    expect(bandaDe(VELOCIDAD_DUDOSA)).toBe('none');
    expect(bandaDe(null)).toBe('none');
    expect(bandaDe(undefined)).toBe('none');
  });

  it('la pérdida se calcula, no se guarda hecha', () => {
    // Serie 2 del squat: 0,55 → 0,38 son 31 puntos de caída dentro de la serie, y
    // es lo que explica que la 3 la bajara a 77,5 kg.
    expect(Math.round(perdidaPct(VELOCIDAD_SQUAT[1])!)).toBe(31);
  });

  it('medio punto de porcentaje no es fatiga, es ruido', () => {
    expect(perdidaPct({ msPrimera: 0.5, msUltima: 0.499, confianza: 0.9 })).toBeNull();
    // Y sin primera repetición medida no hay pérdida que decir.
    expect(perdidaPct({ msPrimera: null, msUltima: 0.42, confianza: 0.9 })).toBeNull();
  });

  it('la cifra va con dos decimales y coma, como en la app', () => {
    expect(msTexto(0.4)).toBe('0,40');
    // 0,615 sale «0,61» y no «0,62» porque en binario es 0,6149…, así que redondea
    // hacia abajo. Se fija a propósito: el `String(format: "%.2f")` de Swift hace
    // exactamente lo mismo con el mismo double, y el día que una de las dos caras
    // «arregle» el redondeo, el doble y la app dirán números distintos.
    expect(msTexto(0.615)).toBe('0,61');
  });

  it('cada banda tiene su palabra: un dato que solo se dice con color no se lee', () => {
    for (const banda of ['green', 'yellow', 'orange', 'red'] as const) {
      expect(ETIQUETA_BANDA[banda]).not.toBe('');
      expect(TONO_BANDA[banda]).toMatch(/^var\(--twin-/);
    }
    // Y `none` no tiene palabra porque no hay nada que decir.
    expect(ETIQUETA_BANDA.none).toBe('');
  });

  it('la velocidad viaja con la serie CERRADA, no con la prescripción', () => {
    const hechas = cerradasHasta(SQUAT_4X10, 2, {}, VELOCIDAD_SQUAT);
    expect(hechas[0].velocidad).toEqual(VELOCIDAD_SQUAT[0]);
    expect(hechas[1].velocidad).toEqual(VELOCIDAD_SQUAT[1]);
    // Sin sensor, las series cerradas no se inventan una lectura.
    expect(cerradasHasta(SQUAT_4X10, 2)[0].velocidad).toBeNull();
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
