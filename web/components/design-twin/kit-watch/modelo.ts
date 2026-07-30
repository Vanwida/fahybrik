// EL MODELO DE LA MUÑECA — lo que decide el diseño ANTES que el formato.
//
// Un reloj no es un móvil recortado, y por eso las nueve vistas no salen de los
// nueve formatos. Salen de dos preguntas que el móvil no tiene que hacerse:
//
// ───────────────────────────────────────────────────────────────────────────
//  (1) ¿QUÉ MIDE EL RELOJ DE VERDAD EN ESTA MODALIDAD?
// ───────────────────────────────────────────────────────────────────────────
//
//   · Corriendo al aire libre     → FC, ritmo y distancia. Todo suyo.
//   · Cinta y ergo (remo/ski/bici) → el reloj NO VE LA MÁQUINA. La lee el móvil
//     por BLE. En la muñeca sólo hay FC y tiempo; lo demás llega repetido, y
//     llega MARCADO (`Fuente.movil`).
//   · Fuerza                       → FC y tiempo, nada más. La carga y las reps
//     no las mide nadie: las declara el atleta (`Fuente.atleta`).
//   · Sin ancla de FC              → no hay zona, y sin zona NO HAY TINTE. El
//     color es un dato (CONTRATO-UI §7 y §10.1).
//
// ───────────────────────────────────────────────────────────────────────────
//  (2) ¿PUEDE MIRAR Y PUEDE TOCAR EN ESTE MOMENTO?
// ───────────────────────────────────────────────────────────────────────────
//
// De aquí salen los tres MODOS, y MANDAN SOBRE EL FORMATO. La misma vista de
// fuerza es dos pantallas distintas según en cuál de los tres esté el atleta,
// y dos formatos distintos comparten pantalla cuando comparten modo.
//
//   · `ciego`  — ni mirar ni tocar. Durante una serie de fuerza el reloj está
//     en la muñeca que sostiene la barra. Un reloj que en ese momento PIDE algo
//     está mal diseñado por definición: no pide nada, y cuando el atleta vuelve
//     le espera con lo que hizo.
//   · `ojeada` — mirar sin tocar. Corriendo, remando: menos de un segundo, con
//     el brazo en movimiento. UN dato gigante a sangre y CERO CONTROLES.
//   · `mando`  — mirar y tocar. Descanso, entre rondas, transición, dobles
//     esperando. Aquí, y sólo aquí, van la decisión y los controles.
//
// Este fichero es PURO a propósito (sin JSX, sin React): el presupuesto de
// altura y la regla de los glifos se comprueban en vitest sin montar un DOM,
// así que «esto no cabe en la muñeca» deja de ser una opinión.

// ---------------------------------------------------------------------------
// Los tres modos
// ---------------------------------------------------------------------------

/** Lo que el atleta PUEDE hacer ahora mismo — manda sobre el formato. */
export type Modo =
  /** Ni mirar ni tocar: el reloj enuncia y espera. Nunca pide. */
  | 'ciego'
  /** Mirar sin tocar: un dato a sangre, sin un solo control. */
  | 'ojeada'
  /** Mirar y tocar: aquí van la decisión y los controles. */
  | 'mando';

/** Lo que cada modo permite en la página. Lo hace cumplir el lienzo, no la vista. */
export const PERMITE: Record<Modo, { accion: boolean; controles: boolean }> = {
  // El enunciado admite una OFERTA en reposo («al acabar, toca»), que no es una
  // petición: se pinta atenuada y no compite con nada.
  ciego: { accion: true, controles: false },
  ojeada: { accion: false, controles: false },
  mando: { accion: true, controles: true },
};

// ---------------------------------------------------------------------------
// De dónde sale cada dato — y se escribe, no se supone
// ---------------------------------------------------------------------------

/**
 * La procedencia de un número en la muñeca. Existe porque el reloj enseña tres
 * cosas muy distintas con la misma cara, y confundirlas es mentir (§7):
 * lo que mide él, lo que le repite el móvil, y lo que el atleta declaró.
 */
export type Fuente =
  /** Sensor propio: FC y tiempo siempre; ritmo y distancia sólo al aire libre. */
  | 'reloj'
  /** El móvil lo lee por BLE de la máquina (cinta, ergo) y se lo pasa. */
  | 'movil'
  /** No lo mide nadie: lo dice el atleta (carga, reps, rondas). */
  | 'atleta';

/**
 * El vocabulario de la honestidad, en un solo sitio. Nueve vistas escribiendo
 * cada una su «(estimado)» es exactamente cómo nacieron las tres grafías del
 * ritmo que motivaron el CONTRATO-UI §2.
 */
export const NOTA = {
  /** El dato lo lee el móvil de la máquina; el reloj sólo lo repite. */
  delMovil: 'del móvil',
  /** No hay máquina emparejada: en la muñeca sólo quedan pulso y tiempo. */
  sinMaquina: 'sin máquina · pulso y tiempo',
  /** Sin ancla de FC no hay zona: fondo neutro y ni una palabra de zona. */
  sinAncla: 'sin umbral · no hay zona',
  /** Hay ancla, pero es estimada: la zona que se pinta cuelga de una estimación. */
  umbralEstimado: 'umbral estimado',
  /** Nadie lo mide: viene de la prescripción o del atleta. */
  loDicesTu: 'lo dices tú',
  /** El GPS aún no ha fijado posición: no hay ritmo ni distancia que pintar. */
  sinSenal: 'sin señal · buscando',
} as const;

// ---------------------------------------------------------------------------
// El ancla de FC — sin ella no hay zona, y sin zona no hay color
// ---------------------------------------------------------------------------

/**
 * El umbral del atleta. `null` = no lo hay, y entonces el pulso se pinta en
 * ppm crudos: ni zona, ni nombre de zona, ni tinte. El color es un dato.
 */
export type Ancla = { ppm: number; estimado: boolean } | null;

export type Zona = 1 | 2 | 3 | 4 | 5;

/**
 * Las mismas fracciones del umbral que resuelve el servidor
 * (`shared/domain/methodology/hr-zones.ts`) y que espeja `sim.ts`. No se
 * redeclaran aquí para no tener dos clasificadores: se importa el de `sim`.
 */
export function zonaConAncla(
  bpm: number | null,
  ancla: Ancla,
  clasificar: (bpm: number, umbral: number) => Zona,
): Zona | null {
  if (bpm == null || ancla == null || ancla.ppm <= 0) return null;
  return clasificar(bpm, ancla.ppm);
}

/**
 * El nombre de la zona en español de box. «Rodaje», «tempo» y «umbral» son
 * jerga de corredor: en la muñeca, sudando, tiene que entenderse sin traducir.
 */
export const ZONA_NOMBRE: Record<Zona, string> = {
  1: 'muy suave',
  2: 'suave',
  3: 'medio',
  4: 'fuerte',
  5: 'máximo',
};

// ---------------------------------------------------------------------------
// EL PRESUPUESTO DE ALTURA — y por qué el ancho es quien de verdad manda
// ---------------------------------------------------------------------------

/** El lienzo del Apple Watch, en puntos. El mismo que fija `DeviceFrame`. */
export const LIENZO = { ancho: 208, alto: 248, radio: 56 } as const;

/** Safe areas del reloj que fija `DeviceFrame`, más los 2 pt que ocupa el aro. */
export const SAFE = { arriba: 24, abajo: 12, lado: 10 } as const;

/** 188 pt. Todo lo que queda a lo ancho después del bisel. */
export const ANCHO_UTIL = LIENZO.ancho - 2 * SAFE.lado;
/** 212 pt. Todo lo que queda a lo alto. */
export const ALTO_UTIL = LIENZO.alto - SAFE.arriba - SAFE.abajo;

/** Lo que se lleva cada fila del lienzo, si está. */
export const FILA = {
  /** La banda de contexto, arriba: dónde estás, en una línea de versales. */
  contexto: 14,
  /** El segundo nivel. Y no hay tercero. */
  segundo: 26,
  /** La franja de acción: una etiqueta sobre un blanco del tamaño de la pantalla. */
  accion: 15,
  /** La nota de procedencia, al pie. */
  nota: 13,
  /** Los puntos de página. Sólo existen si hay más de una. */
  puntos: 14,
} as const;

/** Aire mínimo por encima y por debajo del sujeto. */
const AIRE = 10;

/**
 * Altura de las cifras respecto al cuerpo de la fuente (cap height de la mono).
 * Es la conversión entre «quiero un número de 100 pt» y el `font-size` real.
 */
export const CAP_EM = 0.7;

/**
 * En una monoespaciada TODOS los glifos avanzan lo mismo — 0,6 em en SF Mono y
 * en Menlo, que es lo que resuelve `--twin-font-mono`. Por eso el sujeto se
 * mide contando glifos y no con la estimación calibrada para SF Pro, que da los
 * dos puntos por 0,32 em y deja un «:45» un 18 % más estrecho de lo que ocupa.
 */
export const AVANCE_MONO = 0.6;

/**
 * Techo del sujeto. Por encima el glifo pelea con la curva del bisel y no gana
 * legibilidad: ya se lee de reojo desde mucho antes.
 */
export const SUJETO_TECHO = 150;

/**
 * SUELO del sujeto, en altura de cifra.
 *
 * No es un número de gusto: es la altura a la que un sujeto deja de pesar lo
 * suficiente sobre su apoyo (§4, «el dato pesa más que su etiqueta»). El
 * segundo nivel corre a 22 px de cuerpo ≈ 15 pt de cifra; por debajo de ~3×
 * eso, el numeral deja de leerse como EL dato y pasa a ser una línea de texto
 * grande. 43 pt es justo el caso de 5 glifos, que es el otro tope.
 */
export const SUJETO_SUELO = 43;

/**
 * EL HALLAZGO QUE MANDA SOBRE TODO LO DEMÁS: en la muñeca NO limita el alto,
 * limita el ANCHO. El lienzo tiene 212 pt de alto útil y sólo 188 de ancho, así
 * que un sujeto se queda pequeño por número de cifras mucho antes que por falta
 * de sitio vertical. La tabla, calculada con `altoPorAncho`:
 *
 *   glifos │ ejemplo   │ altura de cifra
 *   ───────┼───────────┼────────────────
 *      1   │ `9`       │ 150 (tope)
 *      2   │ `43`      │ 109
 *      3   │ `139`     │  73
 *      4   │ `:45`+m   │  55
 *      5   │ `63:45`   │  44
 *      6   │ `1:02:40` │  37  ← ya no es un sujeto
 *
 * Consecuencia de diseño, y es la regla que ordena las nueve vistas: **lo que
 * no cabe NO SE ENCOGE, se parte en páginas.** Un crono que pasa de la hora se
 * escribe en minutos (`63:45`, §2 `enHoras:false`) y la hora vive en el
 * contexto; un ritmo con su unidad manda la unidad al segundo nivel.
 */
export const SUJETO_GLIFOS_MAX = 5;

export interface Apoyos {
  /** ¿Hay segundo nivel? */
  segundo: boolean;
  /** ¿Hay franja de acción? */
  accion: boolean;
  /** ¿Hay nota de procedencia al pie? */
  nota: boolean;
  /** ¿Hay más de una página? (si no, los puntos no existen) */
  puntos: boolean;
}

/** Cuenta glifos de verdad (un emoji o una tilde compuesta no son dos). */
export function glifos(texto: string): number {
  return [...texto].length;
}

/** Lo que el PRESUPUESTO VERTICAL deja para el sujeto, una vez puestos los apoyos. */
export function altoPorPresupuesto(a: Apoyos): number {
  const ocupado =
    FILA.contexto +
    (a.segundo ? FILA.segundo : 0) +
    (a.accion ? FILA.accion : 0) +
    (a.nota ? FILA.nota : 0) +
    (a.puntos ? FILA.puntos : 0);
  return Math.min(SUJETO_TECHO, ALTO_UTIL - ocupado - 2 * AIRE);
}

/**
 * La unidad («m», «kg», «/km») va pegada al numeral y en su misma cara, a un
 * 30 % del cuerpo. Ocupa ancho igual: cuenta como 0,3 glifos cada carácter.
 */
export const UNIDAD_EM = 0.3;

/** Lo que el ANCHO del lienzo deja para un texto de N glifos y su unidad. */
export function altoPorAncho(texto: string, unidad?: string): number {
  const n = Math.max(1, glifos(texto) + (unidad ? glifos(unidad) * UNIDAD_EM : 0));
  return (ANCHO_UTIL / (n * AVANCE_MONO)) * CAP_EM;
}

/**
 * LA altura de cifra que de verdad alcanza un sujeto: el menor de los dos
 * límites. En la muñeca casi siempre gana el ancho, y por eso un dato de tres
 * cifras NO se lee como uno de dos aunque el layout sea idéntico.
 */
export function altoSujeto(texto: string, a: Apoyos, unidad?: string): number {
  return Math.min(altoPorPresupuesto(a), altoPorAncho(texto, unidad));
}

/** El diagnóstico de una página: si no cabe, POR QUÉ no cabe. */
export interface Veredicto {
  cabe: boolean;
  alto: number;
  motivo?: 'demasiados-glifos' | 'sin-sitio';
}

/**
 * ¿Cabe este sujeto en la muñeca con estos apoyos?
 *
 * Lo comprueba `kit-watch.test.ts` sobre TODAS las páginas de las nueve vistas,
 * así que una página que no cabe rompe la suite en vez de llegar a un mockup
 * con el número encogido y que nadie mire de cerca.
 */
export function veredicto(texto: string, a: Apoyos, unidad?: string): Veredicto {
  const alto = altoSujeto(texto, a, unidad);
  // El tope de glifos se mide sobre la CIFRA, no sobre la unidad: «450 m» son
  // tres cifras con una marca al lado, no cinco glifos de dato.
  if (glifos(texto) > SUJETO_GLIFOS_MAX) return { cabe: false, alto, motivo: 'demasiados-glifos' };
  return alto >= SUJETO_SUELO ? { cabe: true, alto } : { cabe: false, alto, motivo: 'sin-sitio' };
}
