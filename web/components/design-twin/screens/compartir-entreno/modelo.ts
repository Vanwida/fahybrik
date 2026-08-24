// LA TARJETA — qué es un entreno cuando lo que importa es el vídeo.
//
// ---------------------------------------------------------------------------
// EL VÍDEO MANDA. LA TARJETA ES UNA FIRMA, NO UN CARTEL.
// ---------------------------------------------------------------------------
//
// Lo que hoy hace la gente: captura de pantalla de su app, pegada en una
// esquina, y a veces algo escrito encima. Funciona porque NO le quita el sitio
// al vídeo — que es lo único por lo que grabó. A lo que hay que ganarle es a esa
// captura, y no se le gana haciéndola más grande: se le gana haciéndola
// legible, con su marca y con el dato bien puesto, en el MISMO rincón.
//
// De ahí sale todo lo demás:
//
//   · Lo que se exporta es UNA TARJETA con fondo transparente alrededor, no un
//     lienzo de 1080×1920. Así Instagram la trata como una pegatina y el atleta
//     la mueve y la escala donde no le tape la cara. Un PNG a pantalla completa
//     sería una pegatina inmóvil que ocupa todo.
//   · Se acabó el velo a sangre: la tarjeta lleva SU PROPIO fondo, así que se
//     lee sobre cualquier vídeo sin apagar el resto de la imagen.
//   · Y cabe mucho menos. Una tarjeta de esquina no es la lista del entreno: es
//     su titular. Lo que no entra se declara, nunca se recorta en silencio.

/** La story, solo como referencia de dónde se posa la tarjeta. */
export const STORY = { ancho: 1080, alto: 1920 } as const;

/**
 * LA TARJETA. Ancho fijo y alto tope, ambos en píxeles de la story para que
 * quede claro cuánto ocupa de ella: 700 de 1080 es dos tercios del ancho, y el
 * tope de alto es poco más de un tercio del alto. Por encima de eso deja de ser
 * una firma en una esquina y vuelve a comerse el vídeo.
 */
export const TARJETA = {
  ancho: 700,
  altoMaximo: 700,
  padding: 40,
} as const;

/**
 * EL PRESUPUESTO ES DE ALTO, NO DE LÍNEAS.
 *
 * «Caben seis ejercicios» sería un número inventado: no ocupa lo mismo un
 * entreno de dos bloques que uno de cuatro, porque cada cabecera también gasta.
 * Lo que no se negocia es el alto de la tarjeta, así que se mide en píxeles y
 * cada pieza declara lo suyo. Son los MISMOS valores con los que se dibuja
 * (`cartel.tsx`): si cambia un cuerpo de letra, cambia aquí, y el recorte sigue
 * siendo verdad.
 *
 * Sin esto el fallo es silencioso: un entreno largo se sale de la tarjeta y las
 * líneas de abajo se cortan sin que nada avise.
 *
 * Todos los números son COTA SUPERIOR —lo que la pieza ocupa como mucho, huecos
 * incluidos— y no la medida exacta. Un presupuesto que se queda corto produce
 * exactamente el fallo que viene a evitar; uno que sobra solo deja aire.
 */
export const GASTO = {
  /** Día + título, con el hueco que lo separa de lo que viene debajo. */
  titular: 145,
  /** La fila de números de la tarjeta de después, con su hueco. */
  resultado: 100,
  /** Cabecera de bloque + su raya + el hueco antes del siguiente bloque. */
  cabeceraBloque: 78,
  /** Una línea de ejercicio, con su hueco. */
  linea: 48,
  /** La línea de «+N más». Se reserva en cuanto algo se puede quedar fuera. */
  mas: 58,
  /** La firma del club, con su raya y su hueco. */
  club: 82,
} as const;

/**
 * Los bloques que NO salen. Nadie publica su movilidad, y gastan el sitio que
 * necesita lo que el atleta quiere enseñar. No se borran del entreno: se dejan
 * fuera de la tarjeta, que es distinto.
 */
export const FUERA_POR_DEFECTO = ['warmup', 'cooldown'] as const;

export type FormatoBloque =
  | 'warmup' | 'cooldown' | 'strength' | 'rounds' | 'emom'
  | 'for_time' | 'amrap' | 'intervals' | 'steady' | 'hyrox_sim';

export interface LineaEjercicio {
  /** El movimiento, tal cual lo llama el atleta. */
  nombre: string;
  /**
   * LA DOSIS EN UNA LÍNEA: `4×5 · 80%`, `250 m`, `12 min Z2`. Sale de la
   * prescripción por la misma vía que la app (medida × objetivo), nunca de
   * texto libre — si acabara en texto, ni se podría acortar ni significaría lo
   * mismo en dos entrenos.
   */
  dosis?: string;
  /** Lo que de verdad se hizo. Solo existe en la tarjeta de DESPUÉS. */
  hecho?: string;
}

export interface BloqueCartel {
  titulo: string;
  formato: FormatoBloque;
  /** La cabecera del formato cuando dice algo: `4 rondas`, `EMOM 12′`. */
  pauta?: string;
  ejercicios: LineaEjercicio[];
}

export interface Entreno {
  /** `MARTES` — el día, no la fecha larga: en una story la fecha sobra. */
  dia: string;
  titulo: string;
  bloques: BloqueCartel[];
  /** Solo en la tarjeta de DESPUÉS: el titular de lo que pasó. */
  resultado?: { etiqueta: string; valor: string }[];
}

/** El club del entrenador, cuando la tarjeta lo lleva. */
export interface Club {
  nombre: string;
  /** Su acento — el mismo que ya viaja a la app y al reloj. Nunca uno nuestro. */
  acento: string;
}

/**
 * EL RECORTE, DECLARADO. Devuelve los bloques que caben en la tarjeta y CUÁNTOS
 * ejercicios se quedaron fuera, para poder decirlo.
 *
 * Una tarjeta que recorta callando miente sobre el entreno: quien la ve cree que
 * eso es todo lo que hiciste. Por eso esto nunca devuelve solo la lista corta.
 */
export function recortar(
  bloques: BloqueCartel[],
  opciones: { conClub?: boolean; conResultado?: boolean } = {}
): { visibles: BloqueCartel[]; ocultos: number } {
  const candidatos = bloques.filter(
    (b) => !FUERA_POR_DEFECTO.includes(b.formato as (typeof FUERA_POR_DEFECTO)[number])
  );

  let presupuesto =
    TARJETA.altoMaximo - TARJETA.padding * 2 - GASTO.titular
    - (opciones.conClub ? GASTO.club : 0)
    - (opciones.conResultado ? GASTO.resultado : 0);

  const visibles: BloqueCartel[] = [];
  let ocultos = 0;

  for (const b of candidatos) {
    // En cuanto algo se ha quedado fuera hay que reservar sitio para decirlo:
    // la línea de «+N más» no puede ser lo que se salga de la tarjeta.
    const reserva = ocultos > 0 ? GASTO.mas : 0;
    const paraLineas = presupuesto - GASTO.cabeceraBloque - reserva;
    // Un bloque partido a la mitad se lee peor que un bloque ausente, así que
    // se le pide sitio para dos líneas... salvo que solo TENGA una (un bloque
    // de un ejercicio no se puede partir), en cuyo caso basta con la suya.
    const minimo = Math.min(2, b.ejercicios.length);
    if (paraLineas < GASTO.linea * minimo) {
      ocultos += b.ejercicios.length;
      continue;
    }
    const caben = Math.floor(paraLineas / GASTO.linea);
    const dentro = b.ejercicios.slice(0, caben);
    ocultos += b.ejercicios.length - dentro.length;
    visibles.push({ ...b, ejercicios: dentro });
    presupuesto -= GASTO.cabeceraBloque + dentro.length * GASTO.linea;
  }

  // Los que se dejaron fuera por ser calentamiento o vuelta a la calma NO se
  // cuentan como recortados: no es que no quepan, es que no van.
  return { visibles, ocultos };
}
