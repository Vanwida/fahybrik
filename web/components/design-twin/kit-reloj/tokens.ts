// LOS TOKENS DE LA MUÑECA REHECHA — docs/reloj-muneca/modelo.md §3.
//
// Un token por PAPEL, no por tono. Ninguna pantalla del rediseño escribe un
// `fontSize` ni un hex a mano: tira de aquí. Es la causa raíz nº 2 de la
// auditoría (tres lenguajes visuales, 24 tamaños literales, el naranja con
// ocho significados), y la única forma de que no vuelva es que no haya dónde
// escribir otra cosa.
//
// ── TIPO (P7, Alex 25-09) ──────────────────────────────────────────────────
// SF nativo, cifras de ancho fijo (`tabular-nums`) y RECTAS: nada de itálica
// en el vivo, nada de Menlo. En el doble la cara es `--twin-font-sans` (que en
// el Mac de Alex resuelve SF Pro de verdad). Una escala por papel:
//
//   héroe     44–96 pt, ajustado al ANCHO útil (en la muñeca manda el ancho)
//   segundo   30 pt   — lo que falta, cuando el héroe es el objetivo
//   tercero   22 pt   — la otra métrica (pulso o ritmo)
//   contexto  16 pt semibold — «Serie 3/6 · 1000 m»
//   nota      15 pt   — procedencia, cue del coach, honestidad. EL SUELO.
//   botón     ≥ 44 pt de alto
//
// Nada por debajo de 15 pt. Si una frase no cabe a 15 pt, la frase es larga.
//
// ── COLOR (P6) ─────────────────────────────────────────────────────────────
// Un color, un significado. Naranja de marca SOLO para acción (botones,
// control activo) y el trabajo en el aro. Zonas por espectro del coach (3–9
// zonas), Z1 azul pizarra y nunca el gris de tinta2. Recuperación y descanso,
// monocromos. El veredicto NO cambia de color: cambia la marca (▲▼) y la
// palabra.

// ---------------------------------------------------------------------------
// Lienzo
// ---------------------------------------------------------------------------

/** 46 mm, en pt. El ajuste por ancho sirve también a 42 mm (187×223) y 49 mm (205×251). */
export const LIENZO = { ancho: 208, alto: 248, radio: 56 } as const;

/** Safe areas del modelo §3: arriba 24 (la hora del sistema), lados 10, abajo 12. */
export const SAFE = { arriba: 24, abajo: 12, lado: 10 } as const;

/** 188 pt: todo lo que queda a lo ancho. */
export const ANCHO_UTIL = LIENZO.ancho - 2 * SAFE.lado;
/** 212 pt: todo lo que queda a lo alto. */
export const ALTO_UTIL = LIENZO.alto - SAFE.arriba - SAFE.abajo;
/**
 * Ancho del héroe: el útil menos 1 pt por lado, de aire. Los puntos de página
 * viven arriba a la derecha, junto a la corona, por encima de la línea del
 * héroe, así que no le quitan ancho.
 */
export const ANCHO_HEROE = ANCHO_UTIL - 2;
/**
 * Ancho de la ÚLTIMA fila: pegada abajo, las esquinas redondeadas (radio 56)
 * y el aro se comen los lados. Medido sobre el lienzo de 46 mm: a la altura
 * de la última línea quedan ~160 pt entre aro y aro. Lo ancho va más arriba.
 */
export const ANCHO_PIE = 160;
/** Ancho de la PRIMERA fila (el contexto), bajo las esquinas de arriba: ~184 pt. */
export const ANCHO_CABEZA = 184;

// ---------------------------------------------------------------------------
// Tipo
// ---------------------------------------------------------------------------

export type Peso = 500 | 600 | 700;

export const T = {
  heroe: { min: 44, max: 96, peso: 600 as Peso, caja: 0.84 },
  segundo: { cuerpo: 30, peso: 600 as Peso },
  tercero: { cuerpo: 22, peso: 600 as Peso },
  contexto: { cuerpo: 16, peso: 600 as Peso },
  nota: { cuerpo: 15, peso: 500 as Peso },
  /** La unidad pegada al héroe: un 28 % de su cuerpo, nunca por debajo del suelo. */
  unidad: { factor: 0.28, suelo: 15, peso: 600 as Peso },
  boton: { alto: 44, cuerpo: 17, peso: 600 as Peso },
  /** El suelo absoluto. Lo comprueba cada pieza; nada se pinta por debajo. */
  suelo: 15,
} as const;

/**
 * Lo que se lleva a lo alto cada fila de una lámina, en pt (caja de línea).
 * El héroe se queda con lo que sobra: `altoHeroe` lo calcula.
 */
export const FILA = {
  contexto: 20,
  etiquetaHeroe: 18,
  banda: 32,
  instruccion: 26,
  segundo: 34,
  tercero: 26,
  nota: 18,
  pista: 18,
  boton: 48,
} as const;

/** Aire entre filas. */
export const HUECO = 4;

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

export const C = {
  fondo: '#000000',
  superficie: '#141414',
  superficie2: '#1F1F1F',
  /** El carril apagado de una banda o un aro. */
  carril: '#2A2A2C',
  tinta: '#FFFFFF',
  tinta2: '#A1A1A6',
  /** Naranja de marca. SOLO acción: botones, control activo. */
  accion: '#F06A2A',
  accionPulsada: '#D85A20',
  /** Texto sobre un botón naranja: negro (6,5:1). El blanco se queda en 3,1:1. */
  sobreAccion: '#000000',
  /** El velo de la pausa y de las capas a pantalla completa. */
  velo: 'rgba(0,0,0,0.72)',
} as const;

/**
 * EL ESPECTRO DE ZONAS — azul → verde → ámbar → rojo, con las N zonas del
 * coach (3–9; watchOS 27 admite hasta 9). Z1 es azul pizarra, nunca el gris
 * de `tinta2`: una zona es un dato, y un dato no se pinta del color del texto
 * secundario (auditoría, lente 4 P1-7). Ningún tono cae cerca del naranja de
 * marca: entre el ámbar y el rojo no hay paso intermedio a propósito.
 */
const ESPECTRO = [
  '#8FB3D9', // pizarra
  '#2F7BFF', // azul
  '#2EC4E6', // cian
  '#2ED3A0', // turquesa
  '#34C759', // verde
  '#A6DC3A', // lima
  '#FFD43B', // amarillo
  '#FFB340', // ámbar
  '#FF4D4D', // rojo
] as const;

/** Qué tonos del espectro toma un coach con N zonas. Siempre empieza en pizarra y acaba en rojo. */
const ELECCION: Record<number, readonly number[]> = {
  3: [0, 4, 8],
  4: [0, 4, 7, 8],
  5: [0, 1, 4, 7, 8],
  6: [0, 1, 4, 6, 7, 8],
  7: [0, 1, 2, 4, 6, 7, 8],
  8: [0, 1, 2, 3, 4, 6, 7, 8],
  9: [0, 1, 2, 3, 4, 5, 6, 7, 8],
};

/** Los colores de las N zonas de un coach, de Z1 a ZN. N fuera de 3–9 se acota. */
export function espectroZonas(n: number): string[] {
  const k = Math.min(9, Math.max(3, Math.round(n)));
  return ELECCION[k]!.map((i) => ESPECTRO[i]!);
}

/** El color de la zona `z` (1..n) de un coach con `n` zonas. */
export function colorZona(z: number, n: number): string {
  const e = espectroZonas(n);
  return e[Math.min(e.length, Math.max(1, z)) - 1]!;
}

/** Mezcla un color con el negro del lienzo: el tinte de fondo de un paso a zona. */
export function tinte(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, ${C.fondo})`;
}

/** Cuánto tinte de zona se permite de fondo. Por encima, tinta2 pierde contraste. */
export const TINTE_ZONA_PCT = 30;

// ---------------------------------------------------------------------------
// Always-On (§3): fondo negro, sin tintes, números en tinta al 60 %, aro
// atenuado, 1 Hz. Lo aplica la carcasa (`Muneca`) — ninguna pieza lo decide.
// ---------------------------------------------------------------------------

export const AOD = {
  tinta: 0.6,
  aro: 0.4,
  tintes: false,
  hz: 1,
} as const;

// ---------------------------------------------------------------------------
// El RPE en palabras — DATO del coach con valor por defecto (HARD RULE Nº0:
// otro entrenador lo diría distinto). Un paso puede traer su propia palabra
// en `Objetivo.palabra`; esto es solo lo que se dice si no la trae.
// ---------------------------------------------------------------------------

export const RPE_PALABRA_DEFECTO: Record<number, string> = {
  1: 'muy suave',
  2: 'muy suave',
  3: 'suave',
  4: 'suave',
  5: 'moderado',
  6: 'moderado',
  7: 'fuerte',
  8: 'fuerte',
  9: 'muy fuerte',
  10: 'máximo',
};

// ---------------------------------------------------------------------------
// Medir texto sin DOM — con métricas de SF Pro, no de una monoespaciada
// ---------------------------------------------------------------------------

/**
 * Avance aproximado de SF Pro (semibold) en em. Las cifras son de ancho fijo
 * (`tabular-nums`): 0,60 em todas, que es lo que hace que «1:11» y «8:88»
 * ocupen lo mismo y el héroe no baile al cambiar de segundo.
 */
const AVANCE: Record<string, number> = {
  ':': 0.29,
  ',': 0.26,
  '.': 0.26,
  ' ': 0.26,
  '\u00A0': 0.26,
  '·': 0.3,
  '/': 0.36,
  '-': 0.36,
  '–': 0.52,
  '—': 0.84,
  '′': 0.26,
  '″': 0.42,
  '%': 0.86,
  '×': 0.6,
  '+': 0.62,
  '▲': 0.72,
  '▼': 0.72,
  '↓': 0.6,
  '↑': 0.6,
  '«': 0.5,
  '»': 0.5,
  '¿': 0.52,
  '?': 0.52,
  '(': 0.34,
  ')': 0.34,
};
const ESTRECHAS = new Set(['i', 'l', 'j', 'í', 'ì', 'I', '1']);
const MEDIAS = new Set(['f', 'r', 't']);
const ANCHAS = new Set(['m', 'w', 'M', 'W']);

function avance(ch: string): number {
  const fijo = AVANCE[ch];
  if (fijo != null) return fijo;
  if (ch >= '0' && ch <= '9') return 0.6;
  if (ESTRECHAS.has(ch)) return 0.27;
  if (MEDIAS.has(ch)) return 0.37;
  if (ANCHAS.has(ch)) return 0.86;
  if (ch !== ch.toLowerCase()) return 0.68;
  return 0.56;
}

/** Ancho estimado de un texto en SF Pro, en pt. Determinista: igual en servidor y en cliente. */
export function anchoTexto(texto: string, cuerpo: number, peso: Peso = 600): number {
  let em = 0;
  for (const ch of texto) em += avance(ch);
  const factor = peso >= 700 ? 1.03 : peso <= 500 ? 0.98 : 1;
  return em * cuerpo * factor;
}

// ---------------------------------------------------------------------------
// El héroe ajustado al ancho (P7)
// ---------------------------------------------------------------------------

/** Separación entre el numeral y su unidad. */
export const HUECO_UNIDAD = 3;

export interface TallaHeroe {
  cuerpo: number;
  cuerpoUnidad: number;
  /** Ancho total estimado (numeral + unidad), en pt. */
  ancho: number;
}

/**
 * El cuerpo del héroe: el mayor de 44–96 pt que cabe en `ancho` con su unidad
 * y en `altoMax` de caja. Si ni a 44 cabe (un «10:59:59» con unidad), baja de
 * 44 antes que desbordar: un número que se sale del reloj es peor que uno
 * pequeño, y la pantalla que lo provoque tiene que cambiar el formato.
 */
export function tallaHeroe(
  texto: string,
  unidad?: string,
  ancho: number = ANCHO_HEROE,
  altoMax: number = Infinity,
): TallaHeroe {
  const techoAlto = Math.floor(altoMax / T.heroe.caja);
  const tope = Math.max(1, Math.min(T.heroe.max, techoAlto));
  const medir = (c: number) => {
    const cu = unidad ? Math.max(T.unidad.suelo, Math.round(c * T.unidad.factor)) : 0;
    const w =
      anchoTexto(texto, c, T.heroe.peso) +
      (unidad ? HUECO_UNIDAD + anchoTexto(unidad, cu, T.unidad.peso) : 0);
    return { cuerpo: c, cuerpoUnidad: cu, ancho: w };
  };
  // Si el alto no deja ni el suelo, manda el alto: la pantalla que llega aquí
  // lleva demasiadas filas y es ella la que tiene que quitar alguna.
  const suelo = Math.min(T.heroe.min, tope);
  for (let c = tope; c >= suelo; c -= 1) {
    const m = medir(c);
    if (m.ancho <= ancho) return m;
  }
  // Ni al suelo cabe a lo ancho: se escala lo justo para no desbordar.
  const m = medir(suelo);
  const k = Math.min(1, ancho / m.ancho);
  return { cuerpo: m.cuerpo * k, cuerpoUnidad: Math.max(T.suelo, m.cuerpoUnidad * k), ancho: m.ancho * k };
}

/**
 * Lo que queda de alto para el héroe una vez puestas las filas que la lámina
 * declara. Cada fila presente suma su alto y un hueco.
 */
export function altoHeroe(filas: ReadonlyArray<keyof typeof FILA>): number {
  const ocupado = filas.reduce((a, f) => a + FILA[f] + HUECO, 0);
  return ALTO_UTIL - ocupado - HUECO;
}

/** Cuerpo de una línea de texto que tiene que caber en `ancho`, sin bajar de 15 pt. */
export function cuerpoQueCabe(texto: string, cuerpo: number, ancho: number, peso: Peso = 600): number {
  const w = anchoTexto(texto, cuerpo, peso);
  if (w <= ancho) return cuerpo;
  return Math.max(T.suelo, Math.floor(cuerpo * (ancho / w) * 10) / 10);
}
