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

/**
 * Lo que cada modo permite. Lo hace cumplir el LIENZO, no la vista.
 *
 * ── DONDE EL MODELO DE LOS TRES MODOS SE ROMPIÓ, Y CÓMO QUEDA ──────────────
 *
 * «Mirar sin tocar → cero controles» describe el estado ESTABLE, pero hay un
 * instante que no es ninguno de los tres: el EMOM lo enseña sin margen de duda.
 * Estás pedaleando (ojeada), acabas las 12 calorías y en ese instante paras y
 * SÍ puedes tocar — y tienes que poder, porque marcar la tarea es lo que te da
 * el resto del minuto. Si `ojeada` prohibiera tocar, el formato no funcionaría.
 *
 * La regla, corregida y sin perder nada de la original: **en `ojeada` no hay
 * controles ANUNCIADOS.** La pantalla entera sigue siendo un blanco (no hay que
 * apuntar y no cuesta ni un punto de alto), pero NO se gasta una línea en
 * decirlo. Lo que el modo prohíbe es que un control ocupe sitio y compita con
 * el dato, no que exista un gesto latente.
 *
 * Así los tres modos se distinguen por lo que PINTAN, que es lo que se puede
 * hacer cumplir desde aquí:
 *   · `ciego`  → franja atenuada. Una oferta en reposo, jamás una petición.
 *   · `ojeada` → sin franja. Esos 15 pt vuelven al sujeto.
 *   · `mando`  → franja a plena luz. Aquí la decisión se anuncia.
 */
export const PERMITE: Record<Modo, { franja: boolean; atenuada: boolean }> = {
  ciego: { franja: true, atenuada: true },
  ojeada: { franja: false, atenuada: false },
  mando: { franja: true, atenuada: false },
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
  /**
   * No hay máquina emparejada. Decía «sin máquina · pulso y tiempo» y medía
   * 193 pt sobre un lienzo de 188: se salía del reloj por los dos lados. Y lo
   * que sobraba era además redundante — la página ya enseña el pulso y el
   * tiempo, no hace falta anunciarlos.
   */
  sinMaquina: 'sin máquina emparejada',
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
 *   glifos │ ejemplo  │ altura de cifra
 *   ───────┼──────────┼────────────────
 *      1   │ `9`      │ 150 (le da para 219, pero ahí manda el techo)
 *      2   │ `43`     │ 110
 *      3   │ `139`    │  73
 *      4   │ `1:30`   │  55
 *      5   │ `63:45`  │  44  ← el suelo
 *      6   │ `102:40` │  37  ← ya no es un sujeto, es una línea de texto grande
 *
 * Consecuencia de diseño, y es la regla que ordena las nueve vistas: **lo que
 * no cabe NO SE ENCOGE, se parte en páginas.** Un crono que pasa de la hora se
 * escribe en minutos (`73:00`, §2 `enHoras:false`) y la hora vive en el
 * contexto; un ritmo con su unidad manda la unidad al segundo nivel.
 *
 * Y una cifra menos NO es un 20 % más de altura: es un 50 %. Por eso quitarle
 * un glifo a un sujeto es la palanca de legibilidad más grande que hay aquí,
 * muy por encima de cualquier ajuste de layout.
 */
export const SUJETO_GLIFOS_MAX = 5;

// ---------------------------------------------------------------------------
// Lo que una vista DECLARA — dato puro, para poder comprobarlo sin montar nada
// ---------------------------------------------------------------------------

export interface PaginaReloj {
  /** Para la cronología del panel; también es la `key` del render. */
  id: string;
  /** Banda superior de una línea: dónde estás. */
  contexto: string;
  /** ¿Puede mirar? ¿Puede tocar? De aquí sale todo lo demás. */
  modo: Modo;
  /** El numeral a sangre. */
  sujeto: { texto: string; unidad?: string; tono?: string; latido?: number };
  /** El segundo nivel — y no hay tercero. */
  segundo?: { etiqueta?: string; valor: string; tono?: string };
  /** La franja de acción. En `ojeada` el lienzo la ignora, por diseño. */
  accion?: { etiqueta: string; onToca: () => void };
  /** Versales al pie: procedencia u honestidad. Usa las constantes de `NOTA`. */
  nota?: string;
}

/**
 * El estado de un destello. Va en estado porque el golpe de luz se dispara por
 * SUCESO (cierre de serie, ronda nueva), no por render: sube `n` y el lienzo lo
 * reproduce.
 */
export interface EstadoDestello {
  n: number;
  color: string;
}

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

/**
 * Qué apoyos acaba pintando una página. Vive aquí y no dentro del lienzo para
 * que la comprobación de vitest y el render usen LA MISMA regla: si el test
 * calculara los apoyos por su cuenta, aprobaría layouts que la pantalla no
 * pinta así, que es la peor clase de test verde.
 */
export function apoyosDe(p: PaginaReloj, varias: boolean): Apoyos {
  return {
    segundo: p.segundo != null,
    // En `ojeada` la franja no se pinta aunque la página traiga acción.
    accion: PERMITE[p.modo].franja && p.accion != null,
    nota: p.nota != null,
    puntos: varias,
  };
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

/**
 * EL DECIMAL NO ES EL DATO, ES LA PRECISIÓN — y por eso va a un 42 % del cuerpo.
 *
 * Salió al pintar la primera vista y es de las cosas que sólo se ven mirando la
 * pantalla a tamaño real. En una monoespaciada TODOS los glifos avanzan igual,
 * también la coma, así que un `82,5 kg` se lleva 4,6 glifos de ancho y el
 * numeral se queda en 48 pt de cifra. Escrito así, además, se lee «82 , 5»:
 * la coma abre un hueco idéntico al de una cifra y parte el número en dos.
 *
 * Bajando la parte decimal, el mismo dato pasa a ocupar 3,2 glifos y el numeral
 * sube a 68 pt — un 42 % más grande sin quitar ni un dígito de información.
 * Es la misma jerarquía que usa cualquier instrumento de medida, y es la
 * palanca de legibilidad más barata que hay en un lienzo de 188 pt.
 */
export const DECIMAL_EM = 0.42;

/**
 * Parte un sujeto en la CIFRA que se lee y el DECIMAL que la afina. Lo aplica
 * el numeral solo, sin que las vistas tengan que saberlo: pasan `82,5` y el
 * lienzo hace el resto.
 */
export function partirDecimal(texto: string): { entero: string; decimal?: string } {
  const i = texto.indexOf(',');
  return i < 0 ? { entero: texto } : { entero: texto.slice(0, i), decimal: texto.slice(i) };
}

/** Ancho de un sujeto medido en glifos de cuerpo entero, decimal y unidad aparte. */
export function anchoEnGlifos(texto: string, unidad?: string): number {
  const { entero, decimal } = partirDecimal(texto);
  return (
    glifos(entero) +
    (decimal ? glifos(decimal) * DECIMAL_EM : 0) +
    (unidad ? glifos(unidad) * UNIDAD_EM : 0)
  );
}

/** Lo que el ANCHO del lienzo deja para un texto de N glifos y su unidad. */
export function altoPorAncho(texto: string, unidad?: string): number {
  return (ANCHO_UTIL / (Math.max(1, anchoEnGlifos(texto, unidad)) * AVANCE_MONO)) * CAP_EM;
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
  // El tope se mide sobre la CIFRA ENTERA: «450 m» son tres cifras con una
  // marca al lado, no cinco glifos de dato, y «82,5 kg» son dos con su
  // precisión detrás.
  if (glifos(partirDecimal(texto).entero) > SUJETO_GLIFOS_MAX) {
    return { cabe: false, alto, motivo: 'demasiados-glifos' };
  }
  return alto >= SUJETO_SUELO ? { cabe: true, alto } : { cabe: false, alto, motivo: 'sin-sitio' };
}
