// LAS GUARDAS MUERDEN — la prueba de que la prueba sirve.
//
// Una suite de 800 asserts que pasa a la primera es sospechosa: puede estar
// comprobando de verdad, o puede estar aprobando cualquier cosa. Esto fija los
// casos REALES que se colaron durante la construcción, para que quede escrito
// que el suelo de legibilidad y el ancho del cromo rechazan lo que tienen que
// rechazar y no sólo lo que ya está bien.

import { describe, expect, it } from 'vitest';
import {
  ANCHO_UTIL,
  SUJETO_SUELO,
  veredicto,
  type Apoyos,
} from '@/components/design-twin/kit-watch/modelo';
import { anchoVersales } from '@/components/design-twin/kit-watch/numeral';

/**
 * El cromo tiene que caber A TAMAÑO COMPLETO. El lienzo sabe encogerlo hasta un
 * 82 % para no desbordar nunca, pero eso es una red de seguridad, no un
 * permiso: las versales son ya el texto más pequeño del reloj (10 px) y
 * achicarlas en una pantalla que se lee a distancia de brazo no es una opción.
 */
const TOPE_VERSALES = ANCHO_UTIL;

/** La página más cargada posible: todos los apoyos puestos. */
const APOYOS_LLENOS: Apoyos = { segundo: true, accion: true, nota: true, puntos: true };

describe('el ancho del cromo rechaza lo que no cabe', () => {
  /**
   * El caso real: la nota de «sin máquina» se salía del reloj por los dos
   * lados y sólo se vio en una captura a tamaño real. Ahora lo caza la suite.
   */
  it('«sin máquina · pulso y tiempo» NO cabía — por eso se acortó', () => {
    expect(anchoVersales('sin máquina · pulso y tiempo')).toBeGreaterThan(TOPE_VERSALES);
  });

  it('«sin máquina emparejada», que es lo que quedó, sí cabe', () => {
    expect(anchoVersales('sin máquina emparejada')).toBeLessThanOrEqual(TOPE_VERSALES);
  });
});

describe('el suelo de legibilidad rechaza lo que no se lee', () => {
  /**
   * El caso real: un For Time dura entre 60 y 90 min, y `1:02:40` son SIETE
   * glifos. Escrito así el numeral se queda en 31 pt de cifra — la mitad de un
   * pulso de tres cifras— y deja de ser un sujeto. La salida es el §2
   * (`enHoras: false`), que lo baja a cinco glifos.
   */
  it('un crono con horas NO es un sujeto', () => {
    const v = veredicto('1:02:40', APOYOS_LLENOS);
    expect(v.cabe).toBe(false);
    expect(v.motivo).toBe('demasiados-glifos');
    expect(v.alto).toBeLessThan(SUJETO_SUELO);
  });

  it('el mismo crono en minutos SÍ lo es', () => {
    const v = veredicto('73:00', APOYOS_LLENOS);
    expect(v.cabe).toBe(true);
    expect(v.alto).toBeGreaterThanOrEqual(SUJETO_SUELO);
  });

  /**
   * Y el motivo puede ser el otro: un texto corto que no cabe porque los
   * apoyos se han comido el alto. Con seis apoyos imaginarios no queda sitio.
   */
  it('distingue «no cabe por ancho» de «no cabe por sitio»', () => {
    expect(veredicto('139', APOYOS_LLENOS).cabe).toBe(true);
    expect(veredicto('123456', APOYOS_LLENOS).motivo).toBe('demasiados-glifos');
  });
});

describe('el decimal se subordina, y eso es media cifra de altura', () => {
  it('«82,5» a cuerpo entero sería ilegible; subordinado, no', () => {
    // Con la coma a cuerpo entero eran 4,6 glifos → 48 pt. Subordinada, 3,2 → 68.
    const conDecimal = veredicto('82,5', { ...APOYOS_LLENOS, puntos: false }, 'kg');
    expect(conDecimal.cabe).toBe(true);
    expect(Math.round(conDecimal.alto)).toBeGreaterThan(60);
  });
});
