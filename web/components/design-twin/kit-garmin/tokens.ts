// LOS TOKENS DEL RELOJ GARMIN — docs/garmin-reloj/modelo.md (§3, G11) y el
// encargo del 29-09.
//
// TODO se define en FRACCIONES DEL DIÁMETRO D, nunca en píxeles: la misma
// cara se pinta a 454, 390, 260 y 218. Los píxeles salen al final, de `aPx` y
// `cuerpoPx`, y solo ahí. Un número suelto en una pieza es un bug.
//
// ── LOS CUATRO RELOJES ─────────────────────────────────────────────────────
//   454  AMOLED   FR965 · FR970 · fenix 8          (caso de diseño)
//   390  AMOLED   FR165 · FR570 42 mm              (caso de diseño)
//   260  MIP      FR255 · FR955 · fenix 7          (caso de diseño, sin táctil)
//   218  MIP      FR255S                           (EL SUELO: todo texto cabe aquí)
//
// ── TIPO (G11) ─────────────────────────────────────────────────────────────
// Números en la fuente de marca (la display del wordmark: Archivo Narrow,
// negrita, cursiva; en el reloj, una bitmap de subconjunto `SUBCONJUNTO_CIFRAS`),
// texto en la sans del sistema. Una escala por papel, en fracción de D:
//
//   héroe     0,20–0,26 D, ajustado al ancho útil de su fila (`tallaHeroe`)
//   segundo   0,11 D   — lo que falta
//   tercero   0,085 D  — la otra métrica, el pulso del pie
//   contexto  0,07 D   — baja hasta el suelo antes de perder una parte
//   nota      0,062 D  — EL SUELO: 28 px a 454, 16 a 260, 14 a 218
//
// ── COLOR (P6) ─────────────────────────────────────────────────────────────
// Fondo negro; tinta blanca y tinta2 gris; zonas = el espectro del coach de
// `kit-reloj` (Z1 nunca gris); naranja de marca SOLO para acción y para el
// trabajo en el aro; recuperación y descanso, monocromos. En los MIP (260 y
// 218) TODO color pasa por `aMip`: 4 niveles por canal (64 colores), lo que
// el reloj puede pintar de verdad. Un gris que en MIP se vuelve negro (o
// azul) no es un gris: por eso el carril de aquí no es el de la muñeca. Con 6
// o más zonas, el amarillo y el ámbar del espectro caen en el mismo color MIP
// (#FFAA55): la zona se lee entonces por su número (docs/garmin-reloj/kit.md).
//
// Qué NO hacer: escribir un `fontSize`, un hex o una opacidad en una pieza;
// teñir el fondo en un MIP; usar el naranja para un dato.

import { C, TINTE_ZONA_PCT } from '../kit-reloj/tokens';

// ---------------------------------------------------------------------------
// Los relojes
// ---------------------------------------------------------------------------

export type Tecnologia = 'amoled' | 'mip';
export type Diametro = 454 | 390 | 260 | 218;

export interface Tamano {
  D: Diametro;
  tec: Tecnologia;
  /** Táctil fuera del vivo (brief, controles en pausa, RPE, resumen). En el vivo, nunca. */
  tactil: boolean;
  relojes: string;
}

export const TAMANOS: readonly Tamano[] = [
  { D: 454, tec: 'amoled', tactil: true, relojes: 'FR965 · FR970 · fenix 8' },
  { D: 390, tec: 'amoled', tactil: true, relojes: 'FR165 · FR570 42 mm' },
  { D: 260, tec: 'mip', tactil: false, relojes: 'FR255 · FR955 · fenix 7' },
  { D: 218, tec: 'mip', tactil: false, relojes: 'FR255S' },
];

/** El mínimo es el caso de diseño (§3): lo que no cabe a 218 no cabe. */
export const SUELO_D: Diametro = 218;

export function tamanoDe(D: Diametro): Tamano {
  return TAMANOS.find((t) => t.D === D)!;
}

// ---------------------------------------------------------------------------
// Tipo — fracciones de D
// ---------------------------------------------------------------------------

export const TG = {
  heroe: { min: 0.2, max: 0.26 },
  segundo: 0.11,
  tercero: 0.085,
  contexto: 0.07,
  nota: 0.062,
  /** La unidad pegada a un número («/km», «ppm»): una fracción de su cuerpo, nunca bajo el suelo. */
  unidad: 0.3,
  /** EL SUELO: ningún texto por debajo del 6,2 % de D. */
  suelo: 0.062,
} as const;

/** Alto de la caja de una línea, en fracción de su cuerpo: cifras (sin descendentes) y texto. */
export const CAJA = { cifras: 0.84, texto: 1.2 } as const;

export type Cara = 'cifras' | 'texto' | 'nota';

/**
 * Las dos familias de G11. `cifras` es la display de marca que el doble ya
 * carga (`--font-display`, BrandFonts); en el reloj será una bitmap del
 * SUBCONJUNTO. `texto` y `nota`, la sans del sistema.
 */
export const FUENTE: Record<Cara, { familia: string; peso: 500 | 600 | 700; cursiva: boolean }> = {
  cifras: { familia: 'var(--font-display)', peso: 700, cursiva: true },
  texto: { familia: 'var(--twin-font-sans)', peso: 600, cursiva: false },
  nota: { familia: 'var(--twin-font-sans)', peso: 500, cursiva: false },
};

/** Los aires, en fracción de D: entre un número y su unidad, entre piezas de una línea y entre líneas. */
export const AIRE = { unidad: 0.012, piezas: 0.022, lineas: 0.008 } as const;

/**
 * Los trazos finos, en fracción de D: el hueco entre las zonas de la pista y
 * el filo del marco de la opción enfocada. Con un mínimo en px: a 218 un
 * trazo de fracción se quedaría en medio píxel, y un MIP no pinta medios.
 */
export const TRAZO = { huecoZonas: 0.004, marco: 0.008, minimoPx: { huecoZonas: 1, marco: 2 } } as const;

/** El dibujo de un glifo dentro de su ancho, en em: el corazón y el punto de estado. */
export const DIBUJO = { corazon: 0.8, punto: 0.42 } as const;

/** Las zonas que no son el objetivo, en la pista: a este brillo (en MIP, 0,26 las volvería negras). */
export const ZONA_APAGADA = 0.34;

/** Una fracción de D en píxeles del reloj. */
export function aPx(frac: number, D: number): number {
  return Math.round(frac * D);
}

/** El cuerpo de un texto en píxeles: redondeado, y NUNCA por debajo del suelo (se redondea hacia arriba). */
export function cuerpoPx(frac: number, D: number): number {
  return Math.max(Math.ceil(TG.suelo * D), Math.round(frac * D));
}

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

/**
 * Los colores del reloj. Lo que es igual que en la muñeca se hereda; lo que
 * en MIP desaparecía se sube lo justo para sobrevivir a `aMip`.
 */
export const CG = {
  fondo: C.fondo,
  tinta: C.tinta,
  tinta2: C.tinta2,
  /** Naranja de marca. SOLO acción y el trabajo en el aro. */
  accion: C.accion,
  /** El carril apagado (banda, aro). El de la muñeca (#2A2A2C) cuantiza en MIP a #000055, un azul; este, a #555555. */
  carril: '#3A3A3C',
  /** El tramo del objetivo sobre el carril: en MIP #AAAAAA, distinto del carril. */
  banda: '#8E8E93',
  /** Lo que no es trabajo en el aro (recuperación, descanso, calentamiento). */
  recupera: '#8A8A8E',
  /** La superficie de una franja (deshacer) y del bisel. */
  superficie: C.superficie2,
} as const;

/** Niveles por canal de un MIP transflectivo: 4 (64 colores). */
export const NIVELES_MIP = [0, 85, 170, 255] as const;

function canales(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const largo = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(largo.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const aHex = ([r, g, b]: [number, number, number]) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/** El nivel MIP más cercano de un canal (0–255). */
function nivel(v: number): number {
  return NIVELES_MIP.reduce((mejor, x) => (Math.abs(x - v) < Math.abs(mejor - v) ? x : mejor), NIVELES_MIP[0]);
}

/** FIDELIDAD MIP: el color que un MIP puede pintar de verdad. Solo acepta #RGB / #RRGGBB. */
export function aMip(hex: string): string {
  const [r, g, b] = canales(hex);
  return aHex([nivel(r), nivel(g), nivel(b)]);
}

/**
 * Un color sobre el negro del lienzo a `alfa` (0–1), en HEX: lo que en la
 * muñeca es una opacidad aquí es un color, para poder pasarlo por `aMip`.
 */
export function sobreNegro(hex: string, alfa: number): string {
  const [r, g, b] = canales(hex);
  const a = Math.min(1, Math.max(0, alfa));
  return aHex([r * a, g * a, b * a]);
}

/** El pintor de una tecnología: en AMOLED, el color tal cual; en MIP, `aMip`. */
export function pintorDe(tec: Tecnologia): (hex: string) => string {
  return tec === 'mip' ? aMip : (hex) => hex.toUpperCase();
}

/**
 * El tinte de fondo de un paso a zona: SOLO en AMOLED (en MIP el contraste
 * del transflectivo no lo aguanta; la zona va en el aro y en la banda).
 */
export function tinteDeFondo(zona: string | null, tec: Tecnologia): string | null {
  if (!zona || tec === 'mip') return null;
  return sobreNegro(zona, TINTE_ZONA_PCT / 100);
}

/**
 * El brillo del aro dice DÓNDE ESTÁS (hecho, en curso, por venir), como en
 * `kit-watch`. En MIP, 0,16 cuantiza a negro: lo pendiente desaparecería. Se
 * sube lo justo para que los cuatro niveles lo pinten.
 */
export const BRILLO_ARO: Record<Tecnologia, { hecho: number; enCurso: number; pendiente: number }> = {
  amoled: { hecho: 1, enCurso: 0.4, pendiente: 0.16 },
  mip: { hecho: 1, enCurso: 0.67, pendiente: 0.34 },
};

// ---------------------------------------------------------------------------
// Tiempos de la carcasa y de la pantalla (mecanismo, no método)
// ---------------------------------------------------------------------------

export const TIEMPO = {
  /** Cuánto dura el destello del aro en un aviso fuera de objetivo. */
  destelloMs: 420,
  /** El final natural pasa a quien lo lleve (la familia de después) un instante tras el aviso de sesión hecha. */
  finTrasMs: 700,
  /** Lo que tarda la marca de la banda en llegar a su sitio (la de la muñeca). En MIP no se ve el deslizamiento: salta. */
  marcaMs: 700,
  /** Lo que tarda el arco en curso en avanzar un segundo (AMOLED). */
  avanceAroMs: 900,
} as const;

// ---------------------------------------------------------------------------
// La carcasa (el estudio): proporciones del reloj físico y el rótulo de tecla
// ---------------------------------------------------------------------------

/**
 * La carcasa de un Forerunner/fenix en fracciones de D: el bisel alrededor de
 * la pantalla y los botones. Los ángulos, en grados desde las 12 en sentido
 * horario: a la izquierda LIGHT (10), UP (9), DOWN (8); a la derecha
 * START/STOP (2) y BACK/LAP (4).
 */
export const CARCASA = {
  bisel: 0.075,
  /** El filo del bisel, en fracción del bisel. */
  filo: 0.18,
  /** `asoma`: cuánto sale el botón de la caja; `hundido`: cuánto de su grosor queda dentro. */
  boton: { largo: 0.13, grueso: 0.045, asoma: 0.035, hundido: 0.25 },
  angulo: { light: 300, up: 270, down: 240, start: 60, back: 120 },
  color: { bisel: '#1C1C1E', aro: '#2C2C2E', boton: '#3A3A3C', botonPulsado: C.accion },
  sombra: '0 24px 60px rgba(0,0,0,0.5)',
  /** Cuánto se enciende un botón al pulsarlo, ms. */
  pulsadoMs: 160,
} as const;

/**
 * El estudio alrededor del reloj (rótulos de tecla, selector de tamaño,
 * lector): NO es pantalla del reloj, así que no rige el suelo de D; se lee a
 * tamaño de estudio, como los mandos de `kit-reloj`. En px del estudio.
 */
export const ESTUDIO = {
  /** `aire`: del botón al rótulo; `reserva`: el sitio de los rótulos a cada lado del reloj. */
  rotulo: { cuerpo: 12, color: '#D6D6D6', tecla: '#8E8E93', aire: 10, reserva: 150 },
  chip: { cuerpo: 12, color: '#D6D6D6', borde: 'rgba(255,255,255,0.14)', activo: 'rgba(240,106,42,0.7)', relleno: '6px 11px', hueco: 6, alto: 32 },
  lector: { cuerpo: 12, color: '#9B9B9B', fuerte: '#ECECEC', ancho: 640, alto: 40 },
  hueco: 14,
  /** El hueco entre los relojes de la comparación de tamaños. */
  comparacion: 28,
} as const;
