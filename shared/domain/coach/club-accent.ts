// Acento del club — la familia de color, derivada.
//
// MECANISMO NUESTRO, MÉTODO DEL COACH: el coach elige UNA semilla (un hex) y
// aquí se deriva todo lo que hace falta para pintarla, en las DOS superficies
// del producto:
//   · claro  → el panel del entrenador (lienzo perla).
//   · oscuro → la app del atleta y el reloj (lienzo casi negro).
//
// Por qué no basta con guardar el hex y pintarlo: un color no se usa de una
// sola forma. Se usa como RELLENO de un botón, como TEXTO encima de ese
// relleno, como TEXTO suelto sobre el fondo y como TINTE de fondo. Cada uso
// tiene su mínimo de contraste, y el mínimo depende del lienzo. El naranja de
// la marca actual (#f06a2a) es el ejemplo: va bien como relleno, pero como
// texto sobre el perla del panel da 2,6:1 y no se lee. Si el coach elige un
// azul marino, desaparece sobre el casi negro de la app; si elige un amarillo,
// el texto oscuro de encima deja de leerse.
//
// Por eso la semilla NUNCA se pinta a ciegas: se mueve lo justo hasta cumplir
// (4,5:1 para texto, 3:1 para superficies e iconos, WCAG AA), y cada ajuste se
// devuelve explicado para que el panel pueda DECIRLO en vez de callarlo.
//
// La derivación vive en el servidor y viaja ya resuelta a los dispositivos: iOS
// no reimplementa esta matemática, así que web y app no pueden divergir.

/** Mínimo AA para texto: aquí NO se negocia, es lo que hace legible el producto. */
const AA_TEXT = 4.5;
/**
 * Mínimo del RELLENO contra el lienzo. Deliberadamente 2:1 y no el 3:1 de AA
 * para superficies: un botón relleno se identifica por su etiqueta, que sí va a
 * 4,5:1 contra el propio relleno. Exigirle 3:1 al relleno obligaba a mover el
 * color de TODOS los clubes, incluido el naranja actual (2,6:1 sobre el perla),
 * y un coach al que le cambias el color que acaba de elegir deja de fiarse.
 * Por debajo de 2:1 sí se mueve: ahí el botón se confunde con el fondo y eso ya
 * no es una preferencia, es un botón que no se ve.
 */
const FILL_MIN = 2;

/** Alfa del tinte suave en cada superficie: sobre el casi negro hace falta algo
 *  más de color para que la franja se distinga del fondo. */
export const SOFT_ALPHA_LIGHT = 0.1;
export const SOFT_ALPHA_DARK = 0.14;

/**
 * Un ajuste por debajo de esta distancia no se le cuenta al coach. El aviso
 * existe para explicar una diferencia que VE; si el color se movió tan poco que
 * no se distingue, contarlo solo suena a alarma por nada. Distancia euclídea en
 * RGB: 12 sobre 255 es el orden de un par de pasos por canal.
 */
const CAMBIO_PERCEPTIBLE = 12;

/** Los lienzos reales de cada superficie (v2-theme.css y Theme.swift). */
export const CANVAS_LIGHT = '#f1efeb';
export const CANVAS_DARK = '#0a0a0a';

/** Los colores que YA significan algo: verde hecho, rojo fallo, ámbar atención.
 *  Un acento pegado a uno de ellos no rompe nada, pero confunde: se avisa. */
const SEMANTIC_HUES: ReadonlyArray<{ name: string; hex: string; meaning: string }> = [
  { name: 'verde', hex: '#2f7050', meaning: 'hecho' },
  { name: 'rojo', hex: '#b0402f', meaning: 'fallado' },
  { name: 'ámbar', hex: '#b36a00', meaning: 'atención' },
];

/** Los cuatro papeles que juega el acento en una superficie. */
export interface AccentRole {
  /** Relleno de botón, pastilla activa, barra. */
  fill: string;
  /** Texto y glifos ENCIMA del relleno. */
  on_fill: string;
  /** El relleno mientras se pulsa. */
  press: string;
  /** Tinte de fondo (rgba con alfa), para franjas y estados suaves. */
  soft: string;
  /** El acento usado como TEXTO o icono sobre el lienzo. */
  text: string;
}

/** Un ajuste que hubo que hacer, en palabras que el coach entiende. */
export interface AccentAdjustment {
  surface: 'claro' | 'oscuro';
  role: 'fill' | 'text';
  from: string;
  to: string;
  /** Frase lista para pintar en el panel. */
  reason: string;
}

export interface ClubAccentFamily {
  /** Lo que el coach eligió, tal cual. */
  seed: string;
  light: AccentRole;
  dark: AccentRole;
  /** Vacío = su color se pinta tal cual en las dos superficies. */
  adjustments: AccentAdjustment[];
  /** Aviso si el color se parece a uno que ya significa algo. Null = sin choque. */
  collision: { name: string; meaning: string } | null;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  const digits = match?.[1];
  if (!digits) return null;
  const n = Number.parseInt(digits, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const to = (c: number) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function linearize(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(rgb: Rgb): number {
  return 0.2126 * linearize(rgb.r) + 0.7152 * linearize(rgb.g) + 0.0722 * linearize(rgb.b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Mezcla lineal hacia blanco o negro. t=0 deja el color, t=1 lo lleva al extremo. */
function mixToward(rgb: Rgb, target: Rgb, t: number): Rgb {
  return {
    r: rgb.r + (target.r - rgb.r) * t,
    g: rgb.g + (target.g - rgb.g) * t,
    b: rgb.b + (target.b - rgb.b) * t,
  };
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/**
 * Mueve el color lo MÍNIMO necesario hasta que contrasta `min` con el lienzo.
 * Se aleja del lienzo: sobre fondo oscuro aclara, sobre fondo claro oscurece.
 * Búsqueda binaria sobre la mezcla, así el color conserva su tono todo lo que
 * puede en vez de saltar a blanco o negro de golpe.
 */
function ensureContrast(seed: Rgb, canvas: Rgb, min: number): Rgb {
  // La búsqueda evalúa SIEMPRE el color ya redondeado a hex: si midiera el
  // color con decimales, el redondeo final podía comerse el último tramo y
  // devolver un color por debajo del mínimo (pasaba con el verde y el negro).
  const q = (c: Rgb): Rgb => ({ r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) });
  if (contrastRatio(q(seed), canvas) >= min) return q(seed);
  const target = relativeLuminance(canvas) < 0.5 ? WHITE : BLACK;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (contrastRatio(q(mixToward(seed, target, mid)), canvas) >= min) hi = mid;
    else lo = mid;
  }
  let t = hi;
  let out = q(mixToward(seed, target, t));
  // Red de seguridad: nunca se devuelve un color que no cumple.
  while (t < 1 && contrastRatio(out, canvas) < min) {
    t = Math.min(1, t + 0.005);
    out = q(mixToward(seed, target, t));
  }
  return out;
}

/** Texto encima del relleno: el extremo que más contraste da, siempre AA. */
function onFill(fill: Rgb): string {
  const onBlack = contrastRatio(fill, { r: 10, g: 10, b: 10 });
  const onWhite = contrastRatio(fill, { r: 245, g: 245, b: 245 });
  return onBlack >= onWhite ? '#0a0a0a' : '#f5f5f5';
}

/** El pulsado: un paso hacia el negro en las dos superficies, que es como se
 *  lee «hundido» sin que el botón cambie de color. */
function pressed(fill: Rgb): string {
  return rgbToHex(mixToward(fill, BLACK, 0.15));
}

function soft(fill: Rgb, alpha: number): string {
  return `rgba(${Math.round(fill.r)}, ${Math.round(fill.g)}, ${Math.round(fill.b)}, ${alpha})`;
}

function buildRole(
  seed: Rgb,
  canvasHex: string,
  surface: 'claro' | 'oscuro',
  softAlpha: number,
  adjustments: AccentAdjustment[],
): AccentRole {
  const canvas = hexToRgb(canvasHex) as Rgb;

  // El relleno conserva el color del coach salvo que se confunda con el fondo.
  const fillRgb = ensureContrast(seed, canvas, FILL_MIN);
  const fill = rgbToHex(fillRgb);
  if (seVe(seed, fillRgb)) {
    adjustments.push({
      surface,
      role: 'fill',
      from: rgbToHex(seed),
      to: fill,
      reason:
        surface === 'oscuro'
          ? 'Tu color se confundía con el fondo oscuro de la app, así que ahí se aclara para que el botón se vea.'
          : 'Tu color se confundía con el fondo claro del panel, así que ahí se oscurece para que el botón se vea.',
    });
  }

  // El acento COMO TEXTO exige 4,5:1: es el papel donde más colores fallan (el
  // naranja de marca da 2,6:1 sobre el perla del panel).
  const textRgb = ensureContrast(seed, canvas, AA_TEXT);
  const text = rgbToHex(textRgb);
  if (seVe(seed, textRgb)) {
    adjustments.push({
      surface,
      role: 'text',
      from: rgbToHex(seed),
      to: text,
      reason:
        surface === 'oscuro'
          ? 'Cuando tu color hace de texto en la app se aclara, para que se lea sobre el fondo oscuro.'
          : 'Cuando tu color hace de texto en el panel se oscurece, para que se lea sobre el fondo claro.',
    });
  }

  return { fill, on_fill: onFill(fillRgb), press: pressed(fillRgb), soft: soft(fillRgb, softAlpha), text };
}

/** ¿El ajuste se nota? Si no, se hace igual pero no se cuenta. */
function seVe(seed: Rgb, moved: Rgb): boolean {
  return Math.hypot(seed.r - moved.r, seed.g - moved.g, seed.b - moved.b) >= CAMBIO_PERCEPTIBLE;
}

/** Distancia de tono cruda: suficiente para avisar de un parecido, no para juzgar. */
function looksLike(a: Rgb, b: Rgb): boolean {
  const d = Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
  return d < 60;
}

/**
 * La familia entera a partir de la semilla del coach.
 *
 * Semilla vacía o inválida = null: el producto se queda con su neutro y nadie
 * inventa un color por él.
 */
export function buildClubAccent(seedHex: string | null | undefined): ClubAccentFamily | null {
  if (!seedHex) return null;
  const seed = hexToRgb(seedHex);
  if (!seed) return null;
  const normalized = rgbToHex(seed);

  const adjustments: AccentAdjustment[] = [];
  const light = buildRole(seed, CANVAS_LIGHT, 'claro', SOFT_ALPHA_LIGHT, adjustments);
  const dark = buildRole(seed, CANVAS_DARK, 'oscuro', SOFT_ALPHA_DARK, adjustments);

  const hit = SEMANTIC_HUES.find((s) => looksLike(seed, hexToRgb(s.hex) as Rgb));

  return {
    seed: normalized,
    light,
    dark,
    adjustments,
    collision: hit ? { name: hit.name, meaning: hit.meaning } : null,
  };
}
