// LA GEOMETRÍA DEL CÍRCULO — funciones PURAS, en fracciones de D (D = 1).
//
// En un reloj redondo el ancho útil de una fila depende de su ALTURA: la
// cuerda del círculo, menos el aro de la sesión y su aire. Arriba y abajo las
// esquinas se comen casi todo, y por eso:
//   · el pulso es SIEMPRE la fila de abajo (cabe en una cuerda corta);
//   · el contexto va pegado al fondo de su franja (donde la cuerda es mayor)
//     y baja de cuerpo antes de perder una parte;
//   · nada se coloca por intuición: toda fila pide su ancho a `anchoUtilFila`.
//
// La rejilla del vivo (y de toda cara que se le parezca), de arriba abajo:
//
//   aro      en el borde: radio 0,485 D, grosor 0,035 D
//   contexto 8–22 %      dónde estás
//   héroe    24–60 %     la nota (si la hay) y el número que manda
//   banda    62–70 %     el objetivo con su marca ▲▼ (o la instrucción)
//   secund.  72–84 %     lo que falta / la otra métrica
//   pie      86–94 %     el pulso
//
// Qué NO hacer: medir en píxeles aquí (los píxeles salen en la vista, con
// `aPx`); colocar una fila fuera de su franja; dar por bueno un ancho sin
// preguntar a qué altura está.

export const ARO = { radio: 0.485, grosor: 0.035 } as const;

/** El aire entre el borde interior del aro y el texto. */
export const AIRE_ARO = 0.015;

/** El radio del círculo donde vive el texto: el aro por dentro, menos su aire. */
export const RADIO_UTIL = ARO.radio - ARO.grosor / 2 - AIRE_ARO;

export type Franja = readonly [desde: number, hasta: number];

/** Las franjas del vivo, en fracción de D desde arriba. */
export const REJILLA = {
  contexto: [0.08, 0.22],
  heroe: [0.24, 0.6],
  banda: [0.62, 0.7],
  secundaria: [0.72, 0.84],
  pie: [0.86, 0.94],
} as const satisfies Record<string, Franja>;

export type Fila = keyof typeof REJILLA;

/**
 * Dónde se asienta el contenido dentro de su franja. El contexto, abajo (la
 * cuerda crece al bajar); el pie, arriba (crece al subir); el resto, al centro.
 */
export const ASIENTO: Record<Fila, 'arriba' | 'centro' | 'abajo'> = {
  contexto: 'abajo',
  heroe: 'centro',
  banda: 'centro',
  secundaria: 'centro',
  pie: 'arriba',
};

/**
 * Un texto de una sola parte que no cabe ni al suelo (un nombre de clase
 * largo del coach, «Descanso entre tandas») va en dos líneas: el bloque se
 * apoya en el borde de arriba de la franja del héroe, donde la cuerda de la
 * línea de arriba ya deja pasar una palabra.
 */
export const CONTEXTO_EN_DOS: Franja = [REJILLA.contexto[0], REJILLA.heroe[0]];

/**
 * La pista de la banda del objetivo, en fracción de D: su grosor, el de la
 * marca y el aire sobre ella; y el grosor de la barra que drena el deshacer.
 */
export const PISTA = { alto: 0.018, marca: 0.038, hueco: 0.006, drena: 0.009 } as const;

/**
 * La franja del deshacer: la FILA DEL PIE (donde va el pulso) y, encima, el
 * hueco de la barra que drena. Durante los 5 s el pulso se oculta: es la única
 * excepción a «el pulso, siempre al pie». Lo de arriba (la segunda fila de una
 * dosis, «Luego · …») no se toca jamás.
 */
export const FRANJA_DESHACER: Franja = [REJILLA.pie[0] - PISTA.drena, REJILLA.pie[1]];

/** El sello ✓ de un final, en fracción de D: asentado al fondo de la franja del contexto. */
export const SELLO = 0.077;

/** La cuerda de un círculo de `radio` (centrado en 0,5) a la altura `y`. Fuera del círculo, 0. */
export function cuerdaEn(y: number, radio = 0.5): number {
  const d = y - 0.5;
  if (Math.abs(d) >= radio) return 0;
  return 2 * Math.sqrt(radio * radio - d * d);
}

/**
 * El ancho útil de una fila que ocupa de `y` a `y + alto`: la cuerda del
 * círculo del texto (sin aro ni aire) en el borde de la fila MÁS LEJANO al
 * centro, que es el que manda.
 */
export function anchoUtilFila(y: number, alto: number): number {
  const d = Math.max(Math.abs(y - 0.5), Math.abs(y + alto - 0.5));
  return cuerdaEn(0.5 + d, RADIO_UTIL);
}

/** Dónde empieza una fila de `alto` dentro de su franja, según su asiento. */
export function yEnFranja(fila: Fila, alto: number): number {
  const [desde, hasta] = REJILLA[fila];
  const libre = Math.max(0, hasta - desde - alto);
  const asiento = ASIENTO[fila];
  return asiento === 'arriba' ? desde : asiento === 'abajo' ? desde + libre : desde + libre / 2;
}

/** Una caja colocada: arriba, alto y el ancho útil a esa altura (todo en fracción de D). */
export interface Caja {
  y: number;
  alto: number;
  ancho: number;
}

/** Coloca `alto` en su franja y devuelve su caja con el ancho útil. */
export function cajaEnFila(fila: Fila, alto: number): Caja {
  const y = yEnFranja(fila, alto);
  return { y, alto, ancho: anchoUtilFila(y, alto) };
}

/** Una caja libre (páginas, listas): de `y` con `alto`. */
export function caja(y: number, alto: number): Caja {
  return { y, alto, ancho: anchoUtilFila(y, alto) };
}

/**
 * Reparte `n` filas de `alto` en una franja, centradas y con el mismo hueco
 * entre ellas: las páginas Datos, Vueltas, Estructura y Controles.
 */
export function repartir(n: number, alto: number, franja: Franja): Caja[] {
  const [desde, hasta] = franja;
  const hueco = n > 1 ? Math.max(0, (hasta - desde - n * alto) / (n - 1)) : 0;
  const total = n * alto + (n - 1) * hueco;
  const y0 = desde + (hasta - desde - total) / 2;
  return Array.from({ length: n }, (_, k) => caja(y0 + k * (alto + hueco), alto));
}
