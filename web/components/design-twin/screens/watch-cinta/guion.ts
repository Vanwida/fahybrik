// (3) CINTA — la vista donde se ve qué es capaz de hacer el reloj SOLO.
//
// ── QUÉ MIDE EL RELOJ AQUÍ ─────────────────────────────────────────────────
// FC y tiempo. Se acabó, y no es una limitación de esta app: bajo techo el GPS
// no fija posición, y el acelerómetro de la muñeca mide el BRACEO, no la cinta
// —dos atletas al mismo ritmo con distinto braceo le dan al reloj dos
// distancias distintas—. Los metros y la velocidad son de la MÁQUINA: los lee
// el móvil por BLE y al reloj llegan repetidos, marcados `del móvil`. O no
// llegan, que es lo que pasa hoy.
//
// Porque la cinta NO EXISTE en el modelo de datos: sin columna de interior ni
// de entorno, con `incline_pct` informado en 1 de 206 filas, y con las 2
// plantillas que dicen «cinta» sin una sola asignación. Las cifras de `CINTA`
// van marcadas como propuesta a propósito. Lo que NO es propuesta es la regla
// que ordena la vista, y no depende de ellas: **el reloj no ve la cinta, y la
// app no manda en ella — sólo la lee.**
//
// ── QUÉ PUEDE HACER EL ATLETA ──────────────────────────────────────────────
// Corriendo a 12 km/h sobre una banda que no perdona un tropiezo: mirar sí,
// tocar no (`ojeada`). Un dato gigante y cero controles anunciados. El gesto
// SIGUE existiendo —toda la pantalla es el blanco— y sin cinta emparejada hace
// falta, porque el tramo no lo puede cerrar nadie más que el atleta; pero no se
// anuncia, y esos 15 pt se los queda el sujeto.
//
// Entre tramos el atleta está de pie en los raíles con las manos libres:
// `mando`. Ahí van la decisión y el único control a plena luz de la vista.
//
// ── EL BISEL, Y POR QUÉ SIN CINTA NO HAY ARO ───────────────────────────────
// El aro continuo dibuja lo que queda del tramo. Sin máquina eso NO SE SABE: la
// única fracción que se podría dibujar saldría de suponer una velocidad, que es
// justo el dato que al reloj le falta. Un aro alimentado de una suposición se ve
// EXACTAMENTE IGUAL que uno alimentado de la cinta, así que no informa: miente.
// Por eso aquí el aro no se pinta — y de paso su presencia o su ausencia acaba
// siendo el indicador de emparejamiento más honesto de la pantalla, sin gastar
// una palabra en decirlo.

import {
  NOTA,
  clock,
  distanciaMedida,
  paginaPulso,
  paginaTiempo,
  unidadDistancia,
  velocidad,
  type Ancla,
  type PaginaReloj,
} from '../../kit-watch';
import { ANCLA_MEDIDA, CINTA, SIN_ANCLA, rampa } from '../../datos-reloj';

export type Fase = 'corriendo' | 'entre';

export interface Estado {
  /** ¿El móvil tiene la cinta emparejada y leyendo? Hoy, en producción, nunca. */
  maquina: boolean;
  ancla: Ancla;
  fase: Fase;
  /** Metros del tramo que ha contado LA MÁQUINA. Sin ella no existen. */
  hechosM: number;
  /** Segundos dentro de la fase. Con o sin cinta, esto el reloj sí lo mide. */
  t: number;
}

export interface Gestos {
  /** Cerrar el tramo. Sin cinta emparejada es la ÚNICA forma de cerrarlo. */
  cerrarTramo: () => void;
  /** Arrancar el tramo siguiente, cuando el atleta vuelve a la banda. */
  empezarTramo: () => void;
}

/** La cinta va a velocidad constante — ésa es su naturaleza — y los metros son lineales. */
export const METROS_POR_SEGUNDO = CINTA.velocidadKmH / 3.6;

/**
 * Dónde arranca la reproducción: los 550 m de `CINTA.desdeM`, en segundos. Es la
 * semilla de la simulación, no un dato en pantalla — el reloj no deduce tiempo
 * de unos metros que no ve.
 */
export const DESDE_S = Math.round(CINTA.desdeM / METROS_POR_SEGUNDO);

/** La prescripción del tramo, con la grafía del kit: «1,00 km». */
const TRAMO = `${distanciaMedida(CINTA.tramoM)} ${unidadDistancia(CINTA.tramoM)}`;

/** Dónde estás, en la página del pulso. «Pulso» a secas no dice que estás en la cinta. */
const CONTEXTO_PULSO = 'Cinta · tu pulso';

/**
 * La FC. Sube hacia la máxima del tramo mientras corres y baja hacia la de
 * partida mientras esperas. Es lo único de esta pantalla que mide el reloj y que
 * no se apaga cuando se desempareja nada.
 */
export function bpmDe(e: Estado): number {
  return e.fase === 'corriendo'
    ? rampa(CINTA.fcDesde, CINTA.fcHasta, e.t, 180)
    : rampa(CINTA.fcHasta, CINTA.fcDesde, e.t, 120);
}

/** Los metros que faltan del tramo. Sólo los sabe la máquina. */
export function faltanM(e: Estado): number {
  return Math.max(0, CINTA.tramoM - e.hechosM);
}

export function paginas(e: Estado, g: Gestos): PaginaReloj[] {
  const pulso = paginaPulso({ bpm: bpmDe(e), ancla: e.ancla, contexto: CONTEXTO_PULSO });
  const restoDePaginas = pulso ? [pulso] : [];

  if (e.fase === 'entre') {
    return [
      {
        id: 'entre',
        contexto: 'Entre tramos',
        // De pie en los raíles, manos libres. Aquí SÍ se decide.
        modo: 'mando',
        // Una cuenta ADELANTE y no atrás: la cinta no trae descanso prescrito en
        // ninguna parte de la base, así que no hay nada que agotar. Lo honesto es
        // el tiempo que llevas parado, que el reloj sí mide, y que el atleta
        // cierra cuando vuelve a la banda.
        sujeto: { texto: clock(e.t) },
        // Lo que hay que teclear en la consola al volver: distancia y velocidad.
        // Es el único momento de la vista en que esos números son accionables.
        segundo: { etiqueta: 'Luego', valor: `${TRAMO} · ${velocidad(CINTA.velocidadKmH)} km/h` },
        accion: { etiqueta: 'Toca · empezar el tramo', onToca: g.empezarTramo },
      },
      ...restoDePaginas,
    ];
  }

  if (!e.maquina) {
    // EL MÍNIMO — y hoy, el 100 % de los casos. Sin cinta emparejada el reloj no
    // sabe ni cuántos metros llevas: el sujeto degrada al tiempo del tramo y la
    // segunda página es tu pulso. Un pulsómetro con cronómetro, dicho sin
    // maquillaje, que es lo que hay que enseñar.
    const tiempo = paginaTiempo({
      segundos: e.t,
      contexto: 'Cinta · en el tramo',
      nota: NOTA.sinMaquina,
    });
    return [
      // El gesto no se anuncia (`ojeada` no pinta franja) pero existe y hace
      // falta: sin metros que canten el final, el tramo lo cierra el atleta.
      { ...tiempo, accion: { etiqueta: 'Toca al acabar el tramo', onToca: g.cerrarTramo } },
      ...restoDePaginas,
    ];
  }

  const faltan = faltanM(e);
  return [
    {
      id: 'faltan',
      contexto: 'Cinta · te faltan',
      modo: 'ojeada',
      sujeto: { texto: distanciaMedida(faltan), unidad: unidadDistancia(faltan) },
      // No es una medida del reloj y no se hace pasar por una.
      nota: NOTA.delMovil,
    },
    {
      id: 'velocidad',
      contexto: 'Cinta · velocidad',
      modo: 'ojeada',
      sujeto: { texto: velocidad(CINTA.velocidadKmH) },
      // «km/h» va de segundo nivel y NO pegada a la cifra. Pegada CABE —son
      // cuatro glifos de unidad a 0,3, y con el decimal del kit a 0,42 el
      // numeral aguanta en 54 pt—, pero suelta se lee a 77. Veintitrés puntos de
      // altura de cifra por una unidad que en una cinta no es ambigua: es
      // exactamente el cambio que hace la página del pulso con «ppm», y aquí la
      // lectura es peor (12 km/h, brazo en movimiento).
      segundo: { valor: 'km/h' },
      nota: NOTA.delMovil,
    },
    ...restoDePaginas,
  ];
}

// ---------------------------------------------------------------------------
// Los casos que esta vista puede alcanzar — los recorre `kit-watch.test.ts`
// ---------------------------------------------------------------------------

const MUDO: Gestos = { cerrarTramo: () => {}, empezarTramo: () => {} };

function caso(nombre: string, e: Estado) {
  return { nombre, paginas: paginas(e, MUDO) };
}

export const CASOS = [
  caso('sin máquina · corriendo', {
    maquina: false,
    ancla: SIN_ANCLA,
    fase: 'corriendo',
    hechosM: 0,
    t: DESDE_S,
  }),
  caso('sin máquina · entre tramos', {
    maquina: false,
    ancla: SIN_ANCLA,
    fase: 'entre',
    hechosM: 0,
    t: 24,
  }),
  caso('emparejada · a mitad', {
    maquina: true,
    ancla: SIN_ANCLA,
    fase: 'corriendo',
    hechosM: CINTA.desdeM,
    t: DESDE_S,
  }),
  // El arranque del tramo: los metros que faltan se escriben en km y el sujeto
  // pasa de tres glifos a cuatro. Es el peor caso de ancho de esta vista.
  caso('emparejada · arranque', {
    maquina: true,
    ancla: SIN_ANCLA,
    fase: 'corriendo',
    hechosM: 0,
    t: 0,
  }),
  // Y los últimos metros, que es cuando el numeral crece solo hasta su techo.
  caso('emparejada · últimos metros', {
    maquina: true,
    ancla: SIN_ANCLA,
    fase: 'corriendo',
    hechosM: 995,
    t: 300,
  }),
  // El día que un test escriba un umbral: aparecen la zona y el lienzo teñido.
  caso('emparejada · con umbral', {
    maquina: true,
    ancla: ANCLA_MEDIDA,
    fase: 'corriendo',
    hechosM: CINTA.desdeM,
    t: DESDE_S,
  }),
  caso('emparejada · entre tramos', {
    maquina: true,
    ancla: SIN_ANCLA,
    fase: 'entre',
    hechosM: 0,
    t: 12,
  }),
] as const;
