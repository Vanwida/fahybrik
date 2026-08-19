// EL MODELO DE «LA MUÑECA, LEGIBLE» — los números de la segunda vuelta.
//
// La primera vuelta (`kit-watch/`, 3-ago) resolvió el ANCHO: el sujeto ya no
// se elige por número de glifos sino por lo que cabe, y esa parte ya vive en
// producción (`watch-vivo`, estado «construida»). Esta pantalla ataca lo que
// esa vuelta dejó intacto: el CROMO. La familia de texto que corona TODAS las
// pantallas en vivo —contexto, etiqueta del segundo dato, nota de procedencia,
// franja «Toca · X»— sigue viviendo a 9–11 pt, por debajo de los 16 pt que
// Apple recomienda por defecto en watchOS y que cita explícitamente «si la
// persona está en movimiento» como motivo para no bajar. Es, además, la
// familia MÁS USADA de la app: está en las nueve vistas del kit.
//
// Por eso «hoy» aquí NO es el kit-watch (que ya acertó el ancho): es el
// renderer que kit-watch todavía no ha tocado en esa dimensión — el mismo
// cromo pequeño, con el numeral fijado por CUBETAS de glifos en vez de por
// ancho disponible. Las cubetas de abajo son las que audita `diseno-reloj.md`
// §2, literales.

/** Los ocho tamaños de hoy — ninguno llega a 16 pt salvo el numeral. */
export const HOY = {
  contexto: 11,
  etiquetaSegundo: 10,
  nota: 10,
  accion: 11,
  segundoValor: 18,
  boton: 15,
  cuerpo: 12,
  /** «13,2 (proporcional)»: la unidad hoy es un 24,4 % del cuerpo del numeral. */
  unidadProporcion: 0.244,
} as const;

/** Los ocho tamaños nuevos — nada por debajo de 16 pt, salvo el numeral (que sube). */
export const NUEVO = {
  contexto: 16,
  etiquetaSegundo: 16,
  nota: 16,
  accion: 18,
  segundoValor: 28,
  boton: 18,
  cuerpo: 16,
  /** Fija, no proporcional: la unidad deja de encogerse cuando el numeral encoge. */
  unidadFija: 20,
} as const;

// ---------------------------------------------------------------------------
// El numeral — hoy por CUBETA de glifos, nuevo por ANCHO disponible
// ---------------------------------------------------------------------------

/** Cuenta glifos de verdad (una tilde compuesta no son dos). */
export function glifos(texto: string): number {
  return [...texto].length;
}

/**
 * La tabla literal de `diseno-reloj.md` §2: 1 glifo → 110 pt … 5 o más → 44,
 * el suelo. Es una cubeta por CANTIDAD, ciega a lo que sobre o falte a los
 * lados — por eso un «7» suelto se lleva 110 pt y un cronómetro de cinco
 * cifras, el dato que más se mira corriendo, cae siempre al mínimo.
 */
const HOY_CUBETA: Record<number, number> = { 1: 110, 2: 96, 3: 72, 4: 56 };
const HOY_SUELO = 44;

export function hoySujetoPt(texto: string, unidad?: string): number {
  // Hoy la unidad va pegada en la MISMA tirada: cuenta como glifos de más,
  // así que «450m» cae en la cubeta de 4 glifos igual que un «1:30» suelto.
  const total = glifos(texto) + (unidad ? glifos(unidad) : 0);
  return HOY_CUBETA[total] ?? HOY_SUELO;
}

/** El lienzo real del reloj (`kit-watch/modelo.ts`: 208×248, el mismo aquí). */
export const LIENZO = { ancho: 208, alto: 248 } as const;

/**
 * «La pantalla ES el botón» (movimiento 1, ya aceptado) deja el borde libre
 * salvo los 2 pt del aro — el mismo inset con el que ya trabaja `kit-watch`.
 * Es la MISMA franja de la que dispone hoy: la diferencia no es un lienzo más
 * ancho, es dejar de regalarle ese ancho a un botón de 52 pt y a las tejas de
 * métrica que hoy se lo comen antes de que el numeral vea un solo punto.
 */
const INSET_NUEVO = 2;
export const ANCHO_UTIL_NUEVO = LIENZO.ancho - 2 * INSET_NUEVO;

/** Techo del sujeto — el mismo criterio que `kit-watch/modelo.ts` (SUJETO_TECHO). */
const SUJETO_TECHO = 130;

/** Avance de una cifra tabular en la monoespaciada (idéntico a `kit-watch`). */
const AVANCE_MONO = 0.6;
/** Conversión de altura de cifra a `font-size` (cap height de la mono). */
const CAP_EM = 0.7;
/** El decimal se subordina al 42 % del cuerpo (misma regla que `kit-watch`). */
const DECIMAL_EM = 0.42;

function partirDecimal(texto: string): { entero: string; decimal?: string } {
  const i = texto.indexOf(',');
  return i < 0 ? { entero: texto } : { entero: texto.slice(0, i), decimal: texto.slice(i) };
}

/**
 * El numeral nuevo: se mide por el ANCHO que le queda, no por cuántos glifos
 * tiene. La unidad ya NO comparte cuerpo con el número — es fija a 20 pt
 * (`NUEVO.unidadFija`), así que primero se le reserva su hueco y el numeral
 * se calcula sobre lo que sobra, igual que haría un instrumento de medida.
 */
export function nuevoSujetoPt(texto: string, unidad?: string): number {
  const anchoUnidad = unidad ? glifos(unidad) * AVANCE_MONO * NUEVO.unidadFija + 4 : 0;
  const disponible = Math.max(1, ANCHO_UTIL_NUEVO - anchoUnidad);
  const { entero, decimal } = partirDecimal(texto);
  const anchoGlifos = glifos(entero) + (decimal ? glifos(decimal) * DECIMAL_EM : 0);
  return Math.min(SUJETO_TECHO, (disponible / (Math.max(1, anchoGlifos) * AVANCE_MONO)) * CAP_EM);
}

// ---------------------------------------------------------------------------
// El mismo entreno para las cinco escenas — un For Time de 8 estaciones
// ---------------------------------------------------------------------------

export const ESTACIONES = [
  'SkiErg',
  'Sled push',
  'Sled pull',
  'Burpees',
  'Remo',
  'Farmers carry',
  'Lunges con saco',
  'Wall balls',
] as const;

/** El instante que enseñan `antes-después` y `crono`: estación 4, 08:21 en marcha. */
export const INSTANTE = {
  estacionIndex: 3, // Burpees — 0-based
  segundosDesde: 501, // 08:21
} as const;

/** `mm:ss`, sin horas — el mismo formateador que `watch-live/format.ts` (clock). */
export function clock(seconds: number): string {
  const total = Math.round(Math.max(0, seconds));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${String(m).padStart(2, '0')}:${s}`;
}
