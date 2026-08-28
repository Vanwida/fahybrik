// LA INTERFAZ DEL CORREDOR, CONTRA LOS CASOS QUE TIENE QUE TRAGAR.
//
// La regla se rompe contra los casos, no al revés: si uno no entra en el
// modelo, el modelo está mal. Esta suite es ese stress-test, y comprueba
// además las dos cosas que la card 105 encontró rotas y que ninguna captura
// puede demostrar por sí sola:
//
//   · que CERO metros medidos NO se escribe como «no hay medida», y
//   · que la muñeca y el teléfono no pueden divergir, porque el sujeto sale
//     de la misma función.

import { describe, expect, it } from 'vitest';
import { fmtClock } from '@/components/design-twin/sim';
import { ANCHO_UTIL, anchoVersales } from '@/components/design-twin/kit-watch';
import {
  CAP_S,
  CAP_URGENTE_S,
  FUNDIDO,
  OBJETIVO_SKM,
  RUTA,
  avanzar,
  capQueda,
  cerrarPorToque,
  contextoMuneca,
  estacionDe,
  estado,
  estadoMedida,
  etiquetaSujeto,
  fraccionEstacion,
  juzgar,
  metrosHechos,
  metrosQueFaltan,
  paginas,
  posicion,
  ritmoSkm,
  sujetoDe,
  sujetoEscrito,
  tocarEsLaUnicaSalida,
  type Estado,
} from '@/components/design-twin/screens/corredor/guion';

const MUDO = { estacionHecha: () => {} };

// ---------------------------------------------------------------------------
// La ruta — completa por sí sola, sin un solo hueco de texto libre
// ---------------------------------------------------------------------------

describe('la ruta del chipper', () => {
  it('son 8 estaciones y la mitad las mide el GPS', () => {
    expect(RUTA).toHaveLength(8);
    expect(RUTA.filter((x) => x.mide === 'gps')).toHaveLength(4);
  });

  /**
   * La matriz de completitud del dominio: toda prescripción es cómo se mide el
   * trabajo × contra qué objetivo. Una estación sin dosis o un tramo de correr
   * sin objetivo son prescripciones incompletas, y aquí se caen.
   */
  it('toda estación trae dosis, y todo tramo de correr trae objetivo y techo', () => {
    for (const est of RUTA) {
      expect(est.dosis.length, est.nombre).toBeGreaterThan(0);
      if (est.mide === 'gps') {
        expect(est.objetivoSkm, est.nombre).toBe(OBJETIVO_SKM);
        expect(est.capS, est.nombre).toBe(CAP_S);
      }
    }
  });

  /**
   * El techo tiene que dejar margen sobre el objetivo, o no es un techo: es un
   * objetivo disfrazado. 800 m a 4:15/km son 3:24, y el cap de 4:00 deja 36 s.
   */
  it('el cap deja margen sobre el objetivo del coach', () => {
    const aObjetivo = (800 / 1000) * OBJETIVO_SKM;
    expect(aObjetivo).toBeLessThan(CAP_S);
    expect(CAP_S - aObjetivo).toBeGreaterThan(CAP_URGENTE_S);
  });
});

// ---------------------------------------------------------------------------
// LA REGLA: el sujeto es lo que falta de la pieza que tienes delante
// ---------------------------------------------------------------------------

describe('el sujeto', () => {
  it('en una estación medida son los metros que faltan', () => {
    const e = estado();
    expect(sujetoDe(e)).toEqual({ clase: 'distancia', metros: 284 });
    expect(sujetoEscrito(e)).toEqual({ texto: '284', unidad: 'm' });
    expect(etiquetaSujeto(e)).toBe('Te quedan');
  });

  it('en una estación ciega cae al reloj de la estación, y la dosis pasa al segundo nivel', () => {
    const e = estado({ estacion: 1, enEstacionS: 74 });
    expect(estadoMedida(e)).toBe('nadie');
    expect(sujetoDe(e)).toEqual({ clase: 'reloj', segundos: 74 });
    expect(etiquetaSujeto(e)).toBe('En la estación');
    expect(paginas(e, MUDO)[0]!.segundo).toEqual({ valor: '60 reps · 9 kg' });
  });

  /**
   * Una estación ciega CON metros prescritos es el caso que separa «la medida
   * existe» de «alguien la mide»: el farmers carry son 200 m y no hay sensor
   * que los cuente. Si el modelo mirase la unidad prescrita en vez de mirar
   * quién mide, aquí pintaría metros que nadie ha visto.
   */
  it('unos metros prescritos que nadie mide NO son una medida', () => {
    const e = estado({ estacion: 3, enEstacionS: 51 });
    expect(estacionDe(e).medida).toEqual({ tipo: 'distancia', metros: 200 });
    expect(metrosHechos(e)).toBeNull();
    expect(sujetoDe(e).clase).toBe('reloj');
  });

  it('sin señal cae al mismo sitio, y NO se inventa un ritmo', () => {
    const e = estado({ estacion: 0, enEstacionS: 7, senal: 'buscando' });
    expect(estadoMedida(e)).toBe('buscando');
    expect(metrosHechos(e)).toBeNull();
    expect(ritmoSkm(e)).toBeNull();
    expect(sujetoDe(e)).toEqual({ clase: 'reloj', segundos: 7 });
  });
});

// ---------------------------------------------------------------------------
// EL ARREGLO DE «SIN MEDIR» — el cero es un dato
// ---------------------------------------------------------------------------

describe('los tres estados de la medida', () => {
  /**
   * El fallo que la card 105 vio en el iPhone: GPS fuerte, traza pintándose en
   * el mapa y la distancia diciendo «sin medir». La causa es el `guard
   * meters > 0` de `Formato.distanciaCubierta`, que hace que cero metros y
   * ninguna medida se escriban igual. Aquí no pueden.
   */
  it('con la señal fijada y CERO metros, hay medida y faltan los 800', () => {
    const e = estado({ estacion: 0, bloqueS: 0, enEstacionS: 0 });
    expect(estadoMedida(e)).toBe('midiendo');
    expect(metrosHechos(e)).toBe(0);
    expect(metrosQueFaltan(e)).toBe(800);
    expect(sujetoEscrito(e)).toEqual({ texto: '800', unidad: 'm' });
  });

  it('«no hay fuente» y «la fuente marca cero» son estados distintos', () => {
    const midiendo = estado({ estacion: 0, enEstacionS: 0 });
    const buscando = estado({ estacion: 0, enEstacionS: 0, senal: 'buscando' });
    const nadie = estado({ estacion: 1, enEstacionS: 0 });
    expect([estadoMedida(midiendo), estadoMedida(buscando), estadoMedida(nadie)]).toEqual([
      'midiendo',
      'buscando',
      'nadie',
    ]);
    expect(metrosHechos(midiendo)).toBe(0);
    expect(metrosHechos(buscando)).toBeNull();
    expect(metrosHechos(nadie)).toBeNull();
  });

  /**
   * El aro y la barra sólo se rellenan con lo MEDIDO. Rellenarlos con el
   * tiempo transcurrido en una estación ciega sería fingir un progreso que
   * nadie ha visto.
   */
  it('el progreso se apaga justo donde nadie mide', () => {
    expect(fraccionEstacion(estado({ estacion: 1, enEstacionS: 74 }))).toBe(0);
    expect(fraccionEstacion(estado({ estacion: 0, enEstacionS: 30, senal: 'buscando' }))).toBe(0);
    expect(fraccionEstacion(estado())).toBeGreaterThan(0.6);
  });
});

// ---------------------------------------------------------------------------
// El ritmo: UNA definición, y sólo cuando se puede decir
// ---------------------------------------------------------------------------

describe('el ritmo', () => {
  it('no se escribe por debajo del suelo de 10 m', () => {
    expect(ritmoSkm(estado({ estacion: 0, enEstacionS: 0 }))).toBeNull();
    expect(ritmoSkm(estado({ estacion: 0, enEstacionS: 2 }))).toBeNull();
    expect(ritmoSkm(estado({ estacion: 0, enEstacionS: 30 }))).not.toBeNull();
  });

  it('es metros del tramo entre tiempo del tramo, y nada más', () => {
    const e = estado();
    const m = metrosHechos(e)!;
    expect(ritmoSkm(e)).toBeCloseTo(e.enEstacionS / (m / 1000), 6);
  });

  it('juzga contra el objetivo del coach, y con las piernas fundidas dice que aprietes', () => {
    expect(juzgar(estado())).toBe('dentro');
    expect(juzgar(estado({ estacion: 6, enEstacionS: 212, piernas: FUNDIDO }))).toBe('lento');
  });

  it('sin objetivo escrito no hay juicio — no se inventa uno', () => {
    // Una estación ciega no lleva objetivo de ritmo: ahí no hay nada que juzgar.
    expect(juzgar(estado({ estacion: 1, enEstacionS: 74 }))).toBe('sin-juicio');
  });
});

// ---------------------------------------------------------------------------
// El cap: el motor ya lo calculaba y ninguna pantalla lo pintaba
// ---------------------------------------------------------------------------

describe('el time cap', () => {
  it('sólo existe donde el coach lo escribió', () => {
    expect(capQueda(estado())).toBe(CAP_S - 132);
    expect(capQueda(estado({ estacion: 1, enEstacionS: 74 }))).toBeNull();
  });

  it('aprieta en los últimos 30 s, y ahí es cuando se enciende', () => {
    const apretando = estado({ estacion: 6, enEstacionS: 212, piernas: FUNDIDO });
    expect(capQueda(apretando)).toBe(28);
    expect(capQueda(apretando)!).toBeLessThanOrEqual(CAP_URGENTE_S);
    expect(paginas(apretando, MUDO)[0]!.sujeto.tono).toBeTruthy();
    // Y a mitad de estación, ni rastro de naranja: un aviso permanente no avisa.
    expect(paginas(estado(), MUDO)[0]!.sujeto.tono).toBeUndefined();
  });

  it('la página del reloj dice el techo y la puntuación, en ese orden', () => {
    const reloj = paginas(estado(), MUDO)[1]!;
    expect(reloj.sujeto.texto).toBe(fmtClock(CAP_S - 132));
    expect(reloj.segundo?.valor).toBe(`${fmtClock(509)} de bloque`);
  });
});

// ---------------------------------------------------------------------------
// Quién cierra la estación — y por qué eso decide el peso de la acción
// ---------------------------------------------------------------------------

describe('la salida de la estación', () => {
  it('la cierran los metros donde alguien mide, y el atleta donde no', () => {
    expect(tocarEsLaUnicaSalida(estado())).toBe(false);
    expect(tocarEsLaUnicaSalida(estado({ estacion: 1, enEstacionS: 74 }))).toBe(true);
    expect(tocarEsLaUnicaSalida(estado({ estacion: 0, enEstacionS: 5, senal: 'buscando' }))).toBe(true);
  });

  it('cruzar los metros cierra la estación sola y anota su parcial', () => {
    // Un segundo antes de los 800 el tramo sigue abierto; al cruzarlos, cierra.
    let e: Estado = estado({ estacion: 0, bloqueS: 200, enEstacionS: 200, parciales: [] });
    let cerrada = false;
    for (let i = 0; i < 30 && !cerrada; i += 1) {
      const paso = avanzar(e);
      e = paso.estado;
      cerrada = paso.sucesos.some((s) => s.tipo === 'estacion-cerrada' && s.auto);
    }
    expect(cerrada).toBe(true);
    expect(e.estacion).toBe(1);
    expect(e.enEstacionS).toBe(0);
    expect(e.parciales).toHaveLength(1);
  });

  it('una estación ciega no se cierra nunca sola, por muchos segundos que pasen', () => {
    let e: Estado = estado({ estacion: 1, enEstacionS: 0, parciales: [] });
    for (let i = 0; i < 600; i += 1) e = avanzar(e).estado;
    expect(e.estacion).toBe(1);
    expect(e.enEstacionS).toBe(600);
  });

  it('el toque cierra y guarda el parcial real, no el prescrito', () => {
    const { estado: nuevo } = cerrarPorToque(estado({ estacion: 1, enEstacionS: 163, parciales: [209] }));
    expect(nuevo.parciales).toEqual([209, 163]);
    expect(nuevo.estacion).toBe(2);
  });

  it('el GPS fija solo, y lo dice', () => {
    let e: Estado = estado({ estacion: 0, bloqueS: 0, enEstacionS: 0, senal: 'buscando', parciales: [] });
    let fijado = false;
    for (let i = 0; i < 20 && !fijado; i += 1) {
      const paso = avanzar(e);
      e = paso.estado;
      fijado = paso.sucesos.some((s) => s.tipo === 'gps-fijado');
    }
    expect(fijado).toBe(true);
    expect(estadoMedida(e)).toBe('midiendo');
  });
});

// ---------------------------------------------------------------------------
// LA CONVERGENCIA — que es la razón de existir de este fichero
// ---------------------------------------------------------------------------

describe('muñeca y teléfono no pueden divergir', () => {
  /**
   * La auditoría de la card 105: el espejo leía `currentTramo` y el standalone
   * lo ignoraba, así que la misma sesión se veía de dos maneras. Aquí el
   * sujeto de la primera página de la muñeca ES el sujeto del teléfono —
   * literalmente la misma función— y esta prueba se rompe si alguien vuelve a
   * escribirlo por separado.
   */
  const momentos: ReadonlyArray<readonly [string, Estado]> = [
    ['estación de carrera', estado()],
    ['cap encima', estado({ estacion: 6, enEstacionS: 212, piernas: FUNDIDO })],
    ['estación ciega', estado({ estacion: 1, enEstacionS: 74 })],
    ['sin señal', estado({ estacion: 0, enEstacionS: 6, senal: 'buscando' })],
    ['recién fijado', estado({ estacion: 0, enEstacionS: 0 })],
  ];

  for (const [nombre, e] of momentos) {
    it(`${nombre}: el sujeto de la muñeca es el del teléfono`, () => {
      const pagina = paginas(e, MUDO)[0]!;
      const telefono = sujetoEscrito(e);
      expect(pagina.sujeto.texto).toBe(telefono.texto);
      expect(pagina.sujeto.unidad).toBe(telefono.unidad);
    });

    it(`${nombre}: las dos dicen la misma posición en la ruta`, () => {
      expect(contextoMuneca(e).startsWith(posicion(e))).toBe(true);
    });
  }

  it('sin pulso, la muñeca se queda con una página menos en vez de pintar un guion', () => {
    expect(paginas(estado(), MUDO)).toHaveLength(3);
    expect(paginas(estado({ ppm: null }), MUDO)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Multi-tenant: el nombre lo escribe el coach, y puede ser larguísimo
// ---------------------------------------------------------------------------

describe('el contexto de la muñeca aguanta cualquier catálogo', () => {
  it('las 8 estaciones de la ruta caben a tamaño completo', () => {
    for (let i = 0; i < RUTA.length; i += 1) {
      const linea = contextoMuneca(estado({ estacion: i }));
      expect(anchoVersales(linea), `«${linea.toUpperCase()}»`).toBeLessThanOrEqual(ANCHO_UTIL);
    }
  });

  /**
   * Con miles de coaches habrá nombres que no caben. Lo que se recorta es el
   * NOMBRE —que el atleta tiene delante— y nunca la posición, que es lo que no
   * puede reconstruir mirando alrededor.
   */
  it('un nombre imposible se recorta, y la posición sobrevive entera', () => {
    const largo = { ...RUTA[1]!, nombre: 'Sandbag Reverse Lunge Overhead Carry' };
    const e = estado({ estacion: 1 });
    const original = RUTA[1]!;
    try {
      (RUTA as unknown as Array<typeof largo>)[1] = largo;
      const linea = contextoMuneca(e);
      expect(anchoVersales(linea)).toBeLessThanOrEqual(ANCHO_UTIL);
      expect(linea.startsWith('2/8 · ')).toBe(true);
      expect(linea.endsWith('…')).toBe(true);
    } finally {
      (RUTA as unknown as Array<typeof original>)[1] = original;
    }
  });
});
